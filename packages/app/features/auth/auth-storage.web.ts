export const authStorage = {
  getItem: (key: string) => {
    if (typeof localStorage === 'undefined') return Promise.resolve(null)
    return Promise.resolve(localStorage.getItem(key))
  },
  setItem: (key: string, value: string) => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  },
  removeItem: (key: string) => {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  },
}
