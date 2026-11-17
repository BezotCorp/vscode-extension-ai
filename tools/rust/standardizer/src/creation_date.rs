use crate::id_uuid_v7::IdUuidV7;
use std::error::Error;

/// UTC creation day of a record, taken from its UUIDv7 timestamp.
pub(crate) struct CreationDate {
    year: u16,
    month: u8,
    day: u8,
}

impl CreationDate {
    pub(crate) fn from_id(id: IdUuidV7) -> Result<Self, Box<dyn Error>> {
        let milliseconds = id.uuid().as_bytes()[..6]
            .iter()
            .fold(0_i64, |value, byte| (value << 8) | i64::from(*byte));
        // Civil-from-days (proleptic Gregorian calendar), days since 1970-01-01.
        let days = milliseconds.div_euclid(86_400_000) + 719_468;
        let era = days.div_euclid(146_097);
        let day_of_era = days.rem_euclid(146_097);
        let year_of_era =
            (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
        let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
        let shifted_month = (5 * day_of_year + 2) / 153;
        let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
        let month = if shifted_month < 10 {
            shifted_month + 3
        } else {
            shifted_month - 9
        };
        let year = year_of_era + era * 400 + i64::from(month <= 2);
        Ok(Self {
            year: u16::try_from(year)?,
            month: u8::try_from(month)?,
            day: u8::try_from(day)?,
        })
    }

    pub(crate) fn segments(&self) -> Vec<String> {
        vec![
            format!("{:04}", self.year),
            format!("{:02}", self.month),
            format!("{:02}", self.day),
        ]
    }
}
