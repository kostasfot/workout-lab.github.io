import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
export const number = (value: number, maximumFractionDigits = 1) => new Intl.NumberFormat('el-GR', { maximumFractionDigits }).format(value)
export const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`
export const seconds = (value: number) => `${Math.floor(Math.max(0, value) / 60).toString().padStart(2, '0')}:${(Math.max(0, value) % 60).toString().padStart(2, '0')}`
