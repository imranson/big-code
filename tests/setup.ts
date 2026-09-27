import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// With `globals: false`, @testing-library/react's automatic cleanup is not
// registered, so unmount between tests explicitly.
afterEach(() => {
  cleanup()
})