use crate::{
    protection::Protection, protection_step::ProtectionStep, repository::Repository,
    store_lock::StoreLock,
};
use std::{
    error::Error,
    path::{Path, PathBuf},
};

const COMMIT_MESSAGE: &str = "chore: mark standardizer as initialized";

/// Commits and publishes `.lock` through Git, touching nothing else. Never
/// removes the witness, never rewrites history; each step can be retried.
pub(crate) struct LockProtection;

impl LockProtection {
    /// Completes whatever is still missing: the dedicated commit, then its publication.
    /// Git problems are reported as steps not acquired, not as errors.
    pub(crate) fn protect(directory: &Path) -> Result<Protection, Box<dyn Error>> {
        if !StoreLock::exists(directory) {
            return Err("no .lock to protect".into());
        }
        let Some(repository) = Repository::containing(directory)? else {
            let reason = "not inside a Git repository".to_owned();
            return Ok(Protection::new(
                ProtectionStep::NotAcquired(reason.clone()),
                ProtectionStep::NotAcquired(reason),
            ));
        };
        let relative = Self::relative_path(directory, &repository)?;
        let versioning = match Self::commit(&repository, &relative) {
            Ok(step) => step,
            Err(error) => ProtectionStep::NotAcquired(error.to_string()),
        };
        let publication = if versioning.is_acquired() {
            match Self::publish(&repository, &relative) {
                Ok(step) => step,
                Err(error) => ProtectionStep::NotAcquired(error.to_string()),
            }
        } else {
            ProtectionStep::NotAcquired("the lock is not committed yet".to_owned())
        };
        Ok(Protection::new(versioning, publication))
    }

    fn relative_path(directory: &Path, repository: &Repository) -> Result<PathBuf, Box<dyn Error>> {
        Ok(StoreLock::path(&directory.canonicalize()?)
            .strip_prefix(repository.root())
            .map_err(|_| "store folder is outside its Git repository")?
            .to_path_buf())
    }

    fn is_committed(repository: &Repository, relative: &Path) -> Result<bool, Box<dyn Error>> {
        let object = format!("HEAD:{}", relative.display());
        Ok(repository.query(&["cat-file", "-e", &object])?.is_some())
    }

    /// Only the lock is added and committed (`--only`): other staged or modified
    /// files, and the staging itself, are left as they were. `--no-verify` skips
    /// the pre-commit hook, which runs the standardizer and would stage and
    /// reformat unrelated files from inside this commit.
    fn commit(repository: &Repository, relative: &Path) -> Result<ProtectionStep, Box<dyn Error>> {
        if Self::is_committed(repository, relative)? {
            return Ok(ProtectionStep::Acquired);
        }
        // `check-ignore` rejects literal pathspecs: 0 = ignored, 1 = not ignored, else failure.
        let mut check = repository.git();
        check.env_remove("GIT_LITERAL_PATHSPECS");
        match check
            .args(["check-ignore", "-q", "--"])
            .arg(relative)
            .status()?
            .code()
        {
            Some(0) => {
                return Ok(ProtectionStep::NotAcquired(
                    "the lock is ignored by Git: remove the matching ignore rule".to_owned(),
                ));
            }
            Some(1) => {}
            _ => return Err("cannot determine whether Git ignores the lock".into()),
        }
        Repository::output(repository.git().args(["add", "--"]).arg(relative))?;
        Repository::output(
            repository
                .git()
                .args([
                    "commit",
                    "--only",
                    "--no-verify",
                    "-m",
                    COMMIT_MESSAGE,
                    "--",
                ])
                .arg(relative),
        )?;
        Ok(ProtectionStep::Acquired)
    }

    /// Pushes only the lock commit, to the configured upstream branch, as a plain
    /// fast-forward: refused when other local commits would be sent along.
    fn publish(repository: &Repository, relative: &Path) -> Result<ProtectionStep, Box<dyn Error>> {
        let Some(branch) = repository.query(&["symbolic-ref", "--short", "-q", "HEAD"])? else {
            return Ok(Self::unpublished("HEAD is detached"));
        };
        let remote = repository.query(&["config", "--get", &format!("branch.{branch}.remote")])?;
        let merge = repository.query(&["config", "--get", &format!("branch.{branch}.merge")])?;
        let (Some(remote), Some(merge)) = (remote, merge) else {
            return Ok(Self::unpublished("the branch has no upstream configured"));
        };
        let Some(commit) = Self::lock_commit(repository, relative)? else {
            return Ok(Self::unpublished("the lock commit cannot be found"));
        };
        let Some(upstream) = repository.query(&["rev-parse", "--verify", "-q", "@{upstream}"])?
        else {
            return Ok(Self::unpublished(
                "the upstream branch is unknown locally: fetch first",
            ));
        };
        if repository
            .query(&["merge-base", "--is-ancestor", &commit, &upstream])?
            .is_some()
        {
            return Ok(ProtectionStep::Acquired);
        }
        let ahead = repository
            .query(&["rev-list", &format!("{upstream}..HEAD")])?
            .unwrap_or_default();
        if ahead.lines().collect::<Vec<_>>() != [commit.as_str()] {
            return Ok(Self::unpublished(
                "other local commits would be published along with it, or the lock commit is not the only one ahead",
            ));
        }
        if repository
            .query(&["rev-list", "--count", &format!("HEAD..{upstream}")])?
            .is_some_and(|count| count != "0")
        {
            return Ok(Self::unpublished("the branch is behind its upstream"));
        }
        match Repository::output(repository.git().args([
            "push",
            "--",
            &remote,
            &format!("{commit}:{merge}"),
        ])) {
            Ok(_) => Ok(ProtectionStep::Acquired),
            Err(error) => Ok(Self::unpublished(&error.to_string())),
        }
    }

    /// Latest commit touching the lock.
    fn lock_commit(
        repository: &Repository,
        relative: &Path,
    ) -> Result<Option<String>, Box<dyn Error>> {
        let output = repository
            .git()
            .args(["log", "-n", "1", "--format=%H", "--"])
            .arg(relative)
            .output()?;
        let hash = String::from_utf8(output.stdout)?.trim().to_owned();
        Ok((output.status.success() && !hash.is_empty()).then_some(hash))
    }

    fn unpublished(reason: &str) -> ProtectionStep {
        ProtectionStep::NotAcquired(reason.to_owned())
    }
}
