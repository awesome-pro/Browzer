import React from 'react'
import { Button } from './button'
import { FaSun, FaMoon } from 'react-icons/fa'
import { useTheme } from './theme-provider'

function ThemeToggle() {
    const { setTheme, theme } = useTheme()
    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark')
    }
  return (
    <Button variant="outline" size="icon" onClick={toggleTheme}>
        {theme === 'dark' ? <FaSun className="h-4 w-4" /> : <FaMoon className="h-4 w-4" />}
    </Button>
      
  )
}

export default ThemeToggle
