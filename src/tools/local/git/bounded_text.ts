const HEAD_CHARS = 4_000;
const TAIL_CHARS = 36_000;

// Keeps the beginning and the end of a stream, which is where programs print what matters.
export class BoundedText {
  private head = '';
  private tail = '';
  private omitted = 0;

  append(chunk: string): void {
    if (this.head.length < HEAD_CHARS) {
      const room = HEAD_CHARS - this.head.length;

      this.head += chunk.slice(0, room);
      chunk = chunk.slice(room);
    }

    this.tail += chunk;

    if (this.tail.length > TAIL_CHARS) {
      this.omitted += this.tail.length - TAIL_CHARS;
      this.tail = this.tail.slice(-TAIL_CHARS);
    }
  }

  get truncated(): boolean {
    return this.omitted > 0;
  }

  toString(): string {
    return this.omitted > 0
      ? `${this.head}\n/* ${this.omitted} characters omitted */\n${this.tail}`
      : this.head + this.tail;
  }
}
