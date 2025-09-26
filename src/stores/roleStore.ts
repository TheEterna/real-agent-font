import { defineStore } from 'pinia'

export interface Role {
  id: string
  name: string
  desc: string
  avatar: string
}

export const useRoleStore = defineStore('roleStore', {
  state: () => ({
    roles: [
      {
        id: 'conan',
        name: '柯南',
        desc: '真相只有一个！冷静缜密的推理型角色',
        avatar: '/roles/Conan.png'
      },
      {
        id: 'detective',
        name: '福尔摩斯',
        desc: '观察入微、逻辑严密的侦探角色',
        avatar: '/roles/CrayonXiaoXin.png'
      }
    ] as Role[]
  }),
  getters: {
    getById: (state) => (id: string) => state.roles.find(r => r.id === id)
  },
  actions: {
    setRoles(list: Role[]) {
      this.roles = [...list]
    }
  }
})
