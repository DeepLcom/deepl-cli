## UUID Placeholder Strategy

The TypeScript implementation uses `__INTL_{8-hex}__` placeholders (via `crypto.randomBytes(4).toString('hex')`) instead of sequential `__INTL_N__`. Benefits:

- **No collision risk** between preprocessing passes
- **Globally unique** across parallel translation jobs
- **Pattern**: `__INTL_[0-9a-f]{8}__` — easily detectable for residue checking
- **Validation regex**: `/__INTL_[0-9a-f]+__/g`
