import {expect} from "chai";
import {StatementParser} from "../../src/abap/2_statements/statement_parser";
import {defaultRelease, LanguageVersion} from "../../src/version";
import {Lexer} from "../../src/abap/1_lexer/lexer";
import {MemoryFile} from "../../src/files/memory_file";

describe("statement parser, skipMethodBodies", () => {
  function run(abap: string, skipMethodBodies: boolean) {
    const lexerResult = new Lexer().run(new MemoryFile("zcl_foo.clas.abap", abap));
    return new StatementParser(defaultRelease, undefined, LanguageVersion.Normal, skipMethodBodies).run([lexerResult], [])[0];
  }

  /** statement type and text of each statement */
  function parse(abap: string, skipMethodBodies = true): string[] {
    return run(abap, skipMethodBodies).statements.map(s => s.get().constructor.name + " " + s.concatTokens());
  }

  /** the file tokens */
  function tokens(abap: string, skipMethodBodies = true): string[] {
    return run(abap, skipMethodBodies).tokens.map(t => t.getStr());
  }

  const emptyMethod = [
    "ClassImplementation CLASS lcl IMPLEMENTATION.",
    "MethodImplementation METHOD a.",
    "EndMethod ENDMETHOD.",
    "EndClass ENDCLASS."];

  it("drops the statements and comments between METHOD and ENDMETHOD", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
* comment
    WRITE 1.
    DATA(x) = 2.
  ENDMETHOD.
  METHOD b ##NEEDED.
    WRITE 3.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.deep.equal([
      "ClassImplementation CLASS lcl IMPLEMENTATION.",
      "MethodImplementation METHOD a.",
      "EndMethod ENDMETHOD.",
      "MethodImplementation METHOD b .",
      "EndMethod ENDMETHOD.",
      "EndClass ENDCLASS."]);
  });

  it("a variable named method in the body does not stop the skip", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    method = 1.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.deep.equal(emptyMethod);
  });

  it("keeps a body that defines a macro, the macro is visible after the method", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    DEFINE mac.
      WRITE 1.
    END-OF-DEFINITION.
  ENDMETHOD.
ENDCLASS.
mac.`;
    const result = parse(abap);
    expect(result).to.deep.equal(parse(abap, false));
    expect(result[result.length - 1]).to.equal("Write WRITE 1 .");
  });

  it("keeps a body with a program INCLUDE", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    INCLUDE zinclude.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.include("Include INCLUDE zinclude.");
  });

  it("skips a body with INCLUDE TYPE", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    TYPES BEGIN OF ty.
    INCLUDE TYPE zstruc.
    TYPES END OF ty.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.deep.equal(emptyMethod);
  });

  it("keeps an AMDP body ending with a period, ENDMETHOD is a statement of its own", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT USING ztab.
    select * from ztab.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.deep.equal(parse(abap, false));
  });

  it("keeps a body without ENDMETHOD, before the next method", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    WRITE 1.
  METHOD b.
    WRITE 2.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.include("Write WRITE 1.");
  });

  it("keeps a body without ENDMETHOD, before the next class", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    WRITE 1.
ENDCLASS.
CLASS lcl2 IMPLEMENTATION.
  METHOD b.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.deep.equal(parse(abap, false));
  });

  it("keeps a body after a chained METHOD", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD: a.
    WRITE 1.
  ENDMETHOD.
ENDCLASS.`;
    expect(parse(abap)).to.deep.equal(parse(abap, false));
  });

  it("leaves the tokens of dropped bodies out of the file tokens", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    DATA: x TYPE i, y TYPE i.
    " between statements
    WRITE x.
    " before ENDMETHOD
  ENDMETHOD.
  METHOD b.
    WRITE 1.
  ENDMETHOD
* comment
  .
ENDCLASS.`;
    expect(tokens(abap)).to.deep.equal([
      "CLASS", "lcl", "IMPLEMENTATION", ".",
      "METHOD", "a", ".",
      "ENDMETHOD", ".",
      "METHOD", "b", ".",
      "ENDMETHOD", ".",
      "ENDCLASS", "."]);
  });

  it("keeps the tokens of kept bodies", () => {
    const abap = `CLASS lcl IMPLEMENTATION.
  METHOD a.
    DATA: x TYPE i, y TYPE i.
    DEFINE mac.
    END-OF-DEFINITION.
  ENDMETHOD.
  METHOD b.
    WRITE 1.
  METHOD c.
    WRITE 2.`;
    expect(tokens(abap)).to.deep.equal(tokens(abap, false));
    expect(parse(abap)).to.deep.equal(parse(abap, false));
  });

  it("a last statement without period ends or keeps the body", () => {
    expect(parse(`METHOD a.
  WRITE 1.
ENDMETHOD`)).to.deep.equal(["MethodImplementation METHOD a.", "Unknown ENDMETHOD"]);
    const abap = `METHOD a.
  WRITE 1.
  WRITE 2`;
    expect(parse(abap)).to.deep.equal(parse(abap, false));
  });
});
