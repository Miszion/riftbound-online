'use client'

type SpinnerSize = 'sm' | 'md' | 'lg'

interface LoadingSpinnerProps {
  size?: SpinnerSize
  label?: string
  className?: string
}

export function LoadingSpinner({ size = 'md', label = 'Loading', className }: LoadingSpinnerProps) {
  const classes = ['loading-spinner', `loading-spinner--${size}`]
  if (className) {
    classes.push(className)
  }
  return (
    <span
      className={classes.join(' ')}
      role="status"
      aria-live="polite"
      aria-label={label}
    />
  )
}

export default LoadingSpinner
