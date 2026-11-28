import {AbstractToken} from "../1_lexer/tokens/abstract_token";
import {Pragma} from "../1_lexer/tokens";

export type SplitStatement = {pre: AbstractToken[], post: AbstractToken[], colon: AbstractToken | undefined};
export type HeldStatement = SplitStatement | {comment: AbstractToken, index: number};

// with skipMethodBodies, the statements after a plain "METHOD name." are held back while the body is read and
// dropped at its ENDMETHOD, before they are matched, together with their tokens; for objects whose method
// implementations nothing outside the object reads. A body is kept when dropping it could change what the rest
// of the object means: a macro defined in it is visible after the method, a program INCLUDE brings statements
// from elsewhere, and a method with additions (BY DATABASE, BY KERNEL MODULE) or without its ENDMETHOD is left
// to the normal parse
export class MethodBodies {
  /** statements of the body being read, undefined outside a body */
  private held: HeldStatement[] | undefined = undefined;
  /** token index range of the held statements, [start, end) */
  private start = 0;
  private end = 0;
  /** token index ranges of the dropped bodies, [from, to), ascending */
  private readonly dropped: [number, number][] = [];

  /** holds a comment of the body being read */
  public holdComment(token: AbstractToken, index: number): boolean {
    if (this.held === undefined) {
      return false;
    }
    this.held.push({comment: token, index});
    return true;
  }

  /** the statements to add to the file now, none while a body is held; next is the index of the token after it */
  public statement(statement: SplitStatement, next: number): HeldStatement[] {
    const words = MethodBodies.words(statement);
    let add: HeldStatement[] = [];
    if (this.held !== undefined) {
      if (words[0] === "ENDMETHOD") {
        this.drop();
      } else if (MethodBodies.keepsBody(words)) {
        add = this.release();
      } else {
        this.held.push(statement);
        this.end = next;
        return [];
      }
    }
    add.push(statement);
    // "METHOD name." with nothing else but pragmas, not chained
    if (statement.colon === undefined && words[0] === "METHOD" && words[2] === ".") {
      this.held = [];
      this.start = next;
      this.end = next;
    }
    return add;
  }

  /** the held statements, their body is parsed after all */
  public release(): HeldStatement[] {
    const held = this.held ?? [];
    this.held = undefined;
    return held;
  }

  /** the file tokens without the dropped bodies */
  public keptTokens(tokens: readonly AbstractToken[]): readonly AbstractToken[] {
    if (this.dropped.length === 0) {
      return tokens;
    }
    const kept: AbstractToken[] = [];
    let from = 0;
    for (const [start, end] of this.dropped) {
      for (let i = from; i < start; i++) {
        kept.push(tokens[i]);
      }
      from = end;
    }
    for (let i = from; i < tokens.length; i++) {
      kept.push(tokens[i]);
    }
    return kept;
  }

  private drop() {
    this.dropped.push([this.start, this.end]);
    for (const held of this.held ?? []) {
      // a comment after the last statement of the body
      if ("comment" in held && held.index >= this.end) {
        this.dropped.push([held.index, held.index + 1]);
      }
    }
    this.held = undefined;
  }

  /** a statement in a held body after which the body is parsed after all: METHOD (its ENDMETHOD is missing),
   * a macro definition, a program INCLUDE */
  private static keepsBody(words: readonly string[]): boolean {
    return (words[0] === "METHOD" && (words[2] === "." || words[2] === "BY"))
      || words[0] === "DEFINE"
      || (words[0] === "INCLUDE" && words[1] !== "TYPE" && words[1] !== "STRUCTURE");
  }

  /** the first three upper case token strings of a statement, without pragmas */
  private static words(statement: SplitStatement): string[] {
    const ret: string[] = [];
    for (const tokens of [statement.pre, statement.post]) {
      for (const t of tokens) {
        if (ret.length === 3) {
          return ret;
        } else if (!(t instanceof Pragma)) {
          ret.push(t.getStr().toUpperCase());
        }
      }
    }
    return ret;
  }
}
