import { describe, expect, it } from 'vitest'
import { MAX_NOTE, parseQuickParams } from './quickParams'
import type { Category } from './types'

const T = '2026-11-04T10:00:00.000Z'
const cat = (id: string, name: string, parentId: string | null = null, archivedAt: string | null = null): Category => ({
  id, parentId, name, icon: 'tag', color: '#55D6A0', isFavorite: false, favOrder: 0, sortOrder: 0, archivedAt, createdAt: T, updatedAt: T,
})
const CATS: Category[] = [
  cat('rest', 'Restauración'), cat('cafe', 'Café', 'rest'), cat('bar', 'Tomar algo en un bar', 'rest'),
  cat('ocio', 'Ocio'), cat('act1', 'Actividades', 'ocio'),
  cat('viajes', 'Viajes'), cat('act2', 'Actividades', 'viajes'), cat('trans-v', 'Transporte', 'viajes'),
  cat('transporte', 'Transporte'),
  cat('regalos', 'Regalos'), cat('pareja', 'Pareja'), cat('reg-p', 'Regalos', 'pareja'),
  cat('viejo', 'Antiguo', null, T),
]
const p = (q: Record<string, string | string[]>, kind?: 'expense' | 'income') => parseQuickParams(q, CATS, kind)

describe('parámetros de la URL del formulario rápido', () => {
  describe('tipo', () => {
    it.each([['gasto', 'expense'], ['Gasto', 'expense'], ['expense', 'expense'], ['ingreso', 'income'], ['INGRESO', 'income'], ['income', 'income']])('%s → %s', (v, k) => {
      expect(p({ tipo: v }).kind).toBe(k)
    })
    it('un valor desconocido se ignora', () => {
      expect(p({ tipo: 'regalo' }).kind).toBeUndefined()
      expect(p({ tipo: '' }).kind).toBeUndefined()
    })
  })

  describe('importe', () => {
    it.each([['3,50', '3,5'], ['3.50', '3,5'], ['10', '10'], ['1391,50', '1391,5'], ['1.391,50', '1391,5'], ['0,05', '0,05'], [' 7 ', '7']])('%s → %s', (v, out) => {
      expect(p({ importe: v }).amountText).toBe(out)
    })
    it.each(['', 'abc', '0', '0,00', '-3', '1,234', '3 euros', '1e9', '9999999999', '1.000.000.000'])('se ignora %j', (v) => {
      expect(p({ importe: v }).amountText).toBeUndefined()
    })
    it('respeta el tope (999.999,99 €)', () => {
      expect(p({ importe: '999999,99' }).amountText).toBe('999999,99')
      expect(p({ importe: '1000000' }).amountText).toBeUndefined()
    })
  })

  describe('categoría', () => {
    it('sin tildes ni mayúsculas: «cafe» → Café, con su categoría padre', () => {
      expect(p({ categoria: 'cafe' })).toMatchObject({ categoryId: 'rest', subcategoryId: 'cafe' })
      expect(p({ categoria: 'CAFÉ' })).toMatchObject({ categoryId: 'rest', subcategoryId: 'cafe' })
    })
    it('una categoría principal se elige sin subcategoría', () => {
      expect(p({ categoria: 'Ocio' })).toMatchObject({ categoryId: 'ocio', subcategoryId: null })
    })
    it('si coincide una categoría principal y una subcategoría, manda la principal', () => {
      expect(p({ categoria: 'Regalos' })).toMatchObject({ categoryId: 'regalos', subcategoryId: null })
      expect(p({ categoria: 'Transporte' })).toMatchObject({ categoryId: 'transporte', subcategoryId: null })
    })
    it('el nombre ambiguo entre subcategorías NO se adivina', () => {
      expect(p({ categoria: 'Actividades' }).categoryId).toBeUndefined()
    })
    it('«Padre/Sub» desambigua', () => {
      expect(p({ categoria: 'Viajes/Actividades' })).toMatchObject({ categoryId: 'viajes', subcategoryId: 'act2' })
      expect(p({ categoria: 'ocio/actividades' })).toMatchObject({ categoryId: 'ocio', subcategoryId: 'act1' })
      expect(p({ categoria: 'Viajes/Inexistente' }).categoryId).toBeUndefined()
      expect(p({ categoria: 'Ocio/Café' }).categoryId).toBeUndefined() // Café no cuelga de Ocio
    })
    it('lo inexistente, vacío o archivado se ignora', () => {
      for (const v of ['nope', '', '   ', 'Antiguo', '/', 'a/b/c']) expect(p({ categoria: v }).categoryId, v).toBeUndefined()
    })
    it('un ingreso no lleva categoría', () => {
      expect(p({ tipo: 'ingreso', categoria: 'Café' }).categoryId).toBeUndefined()
      expect(p({ categoria: 'Café' }, 'income').categoryId).toBeUndefined() // ruta /nuevo-ingreso
    })
  })

  describe('nota', () => {
    it('se recorta a la longitud del campo y se limpia', () => {
      expect(p({ nota: 'x'.repeat(500) }).note).toHaveLength(MAX_NOTE)
      expect(p({ nota: '  Con leche  ' }).note).toBe('Con leche')
      expect(p({ nota: 'a\nb\tc\u0000d' }).note).toBe('a b c d')
      expect(p({ nota: '   ' }).note).toBeUndefined()
    })
    it('el HTML queda como texto plano (Vue lo escapa al pintarlo)', () => {
      expect(p({ nota: '<img src=x onerror=alert(1)>' }).note).toBe('<img src=x onerror=alert(1)>')
    })
  })

  it('parámetros repetidos: se usa el primero (vue-router los entrega como lista)', () => {
    expect(p({ importe: ['3', '99'] }).amountText).toBe('3')
  })

  it('NO existe ningún parámetro que guarde: guardar/auto/confirmar se ignoran', () => {
    const out = p({ guardar: '1', auto: '1', confirmar: 'si', save: 'true', importe: '5', categoria: 'Café' })
    expect(Object.keys(out).sort()).toEqual(['amountText', 'categoryId', 'subcategoryId'])
  })

  it('una consulta vacía no produce nada', () => {
    expect(p({})).toEqual({})
  })
})
