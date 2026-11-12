import { DomainValidationError } from "@sincpro/mobile/exceptions";

/** A value SQLite binds. */
export type SqlParam = string | number | null;

/** A statement and its parameters, apart: a value is bound, never pasted into the text. */
export interface SqlStatement {
  readonly text: string;
  readonly params: readonly SqlParam[];
}

/** A table or column name, checked once: what a statement may write as is. */
export interface SqlIdentifier {
  readonly identifier: string;
}

type Bound = SqlParam | boolean | Date;

/** What a `sql` template takes: a value, a list of values, a name, or another statement. */
export type SqlPart = Bound | readonly Bound[] | SqlIdentifier | SqlStatement;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isStatement(part: SqlPart): part is SqlStatement {
  return typeof part === "object" && part !== null && "text" in part && "params" in part;
}

function isIdentifier(part: SqlPart): part is SqlIdentifier {
  return typeof part === "object" && part !== null && "identifier" in part;
}

function bound(value: Bound): SqlParam {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/**
 * A table or column name a statement writes as is — checked to be one, so no text from outside
 * becomes SQL: `sql\`SELECT * FROM ${identifier(table)}\``.
 */
export function identifier(name: string): SqlIdentifier {
  if (!IDENTIFIER.test(name)) throw new DomainValidationError(`'${name}' is not a SQL name`);
  return { identifier: name };
}

/**
 * A statement written as SQL, its values bound: what a query too particular for a criteria is
 * written with — a join, a window, a report —, and still read a page at a time
 * (`DocumentRepository.searchSql`, `pagedQuery`).
 *
 *     sql`SELECT * FROM tickets WHERE json_extract(data, '$.customerId') = ${customerId}`
 *     sql`… WHERE state IN (${["open", "waiting"]})`        a list: one parameter each
 *     sql`SELECT * FROM ${identifier(table)} ${where}`       a name, and another statement
 *
 * A value is a parameter, a list is one parameter per item (`NULL` when empty: it matches
 * nothing), a statement brings its parameters along, and a name goes through `identifier`.
 */
export function sql(strings: TemplateStringsArray, ...parts: SqlPart[]): SqlStatement {
  let text = strings[0];
  const params: SqlParam[] = [];
  parts.forEach((part, index) => {
    if (isStatement(part)) {
      text += part.text;
      params.push(...part.params);
    } else if (isIdentifier(part)) {
      text += part.identifier;
    } else if (Array.isArray(part)) {
      text += part.length > 0 ? part.map(() => "?").join(", ") : "NULL";
      params.push(...(part as readonly Bound[]).map(bound));
    } else {
      text += "?";
      params.push(bound(part as Bound));
    }
    text += strings[index + 1];
  });
  return { text, params };
}
