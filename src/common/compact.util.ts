// Port of the compact() helper repeated across src/lib/repos/*.ts: strips
// keys whose value is `undefined` so partial-update DTOs only ever touch the
// fields the caller actually supplied (Prisma's `update({ data })` still
// writes an explicit `undefined`-free object the same way the old
// hand-built `SET` clause only listed supplied columns).
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>
}
