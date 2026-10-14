import { useCallback, useMemo, useState } from 'react'

import { FinanceDataContext } from '@/hooks/useFinanceData'

export function FinanceDataProvider({ children }) {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const value = useMemo(() => ({ version, refresh }), [version, refresh])
  return <FinanceDataContext.Provider value={value}>{children}</FinanceDataContext.Provider>
}
