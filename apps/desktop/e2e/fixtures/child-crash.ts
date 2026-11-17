// Child process of the Errors Console E2E: dies with an uncaught error. Node runs this file as is
// (type stripping), so its stack points at this TypeScript source. Keep it free of syntax that
// needs a compiler (enums, namespaces, parameter properties).
function crash(): never {
  throw new Error('e2e child crash'); // E2E_MARK_CHILD_THROW
}

crash();
