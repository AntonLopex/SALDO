import { describe, expect, it } from 'vitest'
import { formatCents, parseEuros } from './money'

describe('parseEuros', () => {
  it.each([
    ['3,5', 350],
    ['3.50', 350],
    ['1.391,50', 139150],
    ['3860,14', 386014],
    ['10', 1000],
    ['0,05', 5],
    ['1.000', 100000],
  ])('%s -> %d', (txt, cents) => expect(parseEuros(txt)).toBe(cents))

  it.each(['', 'abc', '1,234', '-3', '1,2,3'])('rechaza %j', (txt) => expect(parseEuros(txt)).toBeNull())
})

describe('formatCents', () => {
  it('formatea en es-ES', () => {
    expect(formatCents(386014).replace(/\s/g, ' ')).toBe('3.860,14 €')
  })
})
