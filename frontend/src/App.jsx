import { FinanceDataProvider } from '@/components/FinanceDataProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Dashboard } from '@/views/Dashboard'

export default function App() {
  return (
    <ThemeProvider>
      <FinanceDataProvider>
        <Dashboard />
      </FinanceDataProvider>
    </ThemeProvider>
  )
}
