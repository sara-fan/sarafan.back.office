// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ref, defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { createInternalProblem } from '../src/errors/problem.js'
import LoginView from '../src/views/LoginView.vue'
import HomeView from '../src/views/HomeView.vue'
import StatusView from '../src/views/StatusView.vue'
import UsersView from '../src/views/UsersView.vue'
import AccountView from '../src/views/AccountView.vue'
import ActionButton from '../src/components/ActionButton.vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import App from '../src/App.vue'

const h=vi.hoisted(()=>({session:null,route:null,router:null}))
vi.mock('../src/stores/session.js',()=>({useSession:()=>h.session}))
vi.mock('vue-router',async original=>({...await original(),useRouter:()=>h.router,useRoute:()=>h.route}))
const identity={id:1,email:'admin@example.test',firstName:'Иван',lastName:'Иванов',patronymic:null,roles:['administrator'],isActive:true}
const roles=[{code:'administrator',displayName:'Administrator'},{code:'operator',displayName:'Operator'}]
const failure=()=>createInternalProblem('networkUnavailable')
const pending=()=>{let resolve;return {promise:new Promise(r=>{resolve=r}),resolve:(v)=>resolve(v)}}
const stubs={
  VTooltip:defineComponent({props:['disabled','openDelay'],template:'<div><slot name="activator" :props="{}"/><slot/></div>'}),
  VIcon:defineComponent({props:['icon','size'],template:'<i :data-icon="icon"/>'}),
  VProgressCircular:defineComponent({template:'<i class="progress"/>'}),
  VDialog:defineComponent({name:'VDialog',props:['modelValue'],emits:['update:modelValue'],template:'<div v-if="modelValue"><slot/></div>'}),
  VApp:defineComponent({template:'<div><slot/></div>'}),
  RouterLink:defineComponent({props:['to'],template:'<a :href="to"><slot/></a>'}),
  RouterView:defineComponent({template:'<div class="route-view"/>'})
}
const wrappers=[]
const render=(view,options={})=>{const w=mount(view,{...options,global:{plugins:[createSarafanVuetify()],stubs,mocks:{$route:h.route}}});wrappers.push(w);return w}
const button=(w,label)=>w.get(`button[aria-label="${label}"]`)
const fill=async(w,name,value)=>w.get(`[name="${name}"]`).setValue(value)
beforeEach(()=>{
  h.route={path:'/users',params:{},query:{}}
  h.router={push:vi.fn().mockResolvedValue(),replace:vi.fn().mockResolvedValue(),currentRoute:ref({fullPath:'/users'})}
  h.session={user:ref({...identity}),ready:ref(true),restoring:ref(false),restoreProblem:ref(null),notice:ref(''),
    login:vi.fn().mockResolvedValue(identity),logout:vi.fn().mockResolvedValue(),restoreSession:vi.fn().mockResolvedValue(),
    listUsers:vi.fn().mockResolvedValue([{...identity},{...identity,id:2,firstName:'Анна',email:'anna@example.test',roles:['operator'],isActive:false}]),
    getUser:vi.fn().mockResolvedValue({...identity}),getRoles:vi.fn().mockResolvedValue(roles),getStatus:vi.fn().mockResolvedValue({appVersion:'0.0.6'}),saveUser:vi.fn().mockResolvedValue(identity),saveProfile:vi.fn().mockResolvedValue(identity)}
})
afterEach(()=>{for(const w of wrappers.splice(0)) w.unmount()})

describe('ActionButton pattern',()=>{
  it('emits its item, preserves attrs/classes, labels icons and explains disabled actions',async()=>{
    const item={id:3};const w=render(ActionButton,{props:{item,icon:'$edit',tooltipText:'Изменить'},attrs:{class:'extra','data-test':'action'}})
    await button(w,'Изменить').trigger('click');expect(w.emitted('click')).toEqual([[item]]);expect(w.get('button').classes()).toContain('extra');expect(w.get('button').attributes('data-test')).toBe('action')
    await w.setProps({disabled:true});expect(w.get('.action-button-disabled').attributes()).toMatchObject({tabindex:'0','aria-disabled':'true','aria-label':'Изменить'})
    await w.setProps({'data-test':'updated'});expect(w.get('button').attributes('data-test')).toBe('updated')
    await button(w,'Изменить').trigger('click');expect(w.emitted('click')).toHaveLength(1)
    await w.setProps({disabled:false,loading:true,label:'Сохранить',variant:'blue'});expect(w.find('.progress').exists()).toBe(true);expect(w.get('button').attributes('aria-busy')).toBe('true')
    await w.setProps({loading:false,tooltipText:'',type:'submit'});expect(w.get('button').attributes('aria-label')).toBe('Сохранить');expect(w.get('button').attributes('type')).toBe('submit')
  })
  it('supports cancellation, confirmation and outside dismissal consistently',async()=>{
    const w=render(ConfirmDialog,{props:{open:true,message:'Проверка'}})
    await button(w,'Отмена').trigger('click');await button(w,'Подтвердить').trigger('click')
    w.findComponent({name:'VDialog'}).vm.$emit('update:modelValue',false)
    w.findComponent({name:'VDialog'}).vm.$emit('update:modelValue',true)
    expect(w.emitted('cancel')).toHaveLength(2);expect(w.emitted('confirm')).toHaveLength(1)
  })
})
describe('staff views',()=>{
  it('validates login, reveals password, preserves failed fields, and navigates only on success',async()=>{
    h.route={path:'/login',params:{},query:{return:'/users/2'}};h.session.notice.value='Войдите повторно'
    const w=render(LoginView);await w.get('form').trigger('submit');expect(w.findAll('.field-error').some(e=>e.text())).toBe(true)
    await fill(w,'email','a@b.test');await fill(w,'password','test-password');await w.get('[type="checkbox"]').setValue(true);expect(w.get('[name=password]').attributes('type')).toBe('text')
    h.session.login.mockRejectedValueOnce(failure());await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=alert]').text()).toContain('Проверьте');expect(w.get('[name=password]').element.value).toBe('test-password');expect(h.router.replace).not.toHaveBeenCalled()
    const wait=pending();h.session.login.mockReturnValueOnce(wait.promise);await w.get('form').trigger('submit');await w.get('form').trigger('submit');expect(h.session.login).toHaveBeenCalledTimes(2);wait.resolve(identity);await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/users/2')
    h.session.login.mockResolvedValueOnce(null);await w.get('form').trigger('submit');await flushPromises();expect(h.router.replace).toHaveBeenCalledTimes(1)
  })
  it('shows only available home actions and dedicated missing/forbidden pages',async()=>{
    const w=render(HomeView);expect(w.find('a[href="/users"]').exists()).toBe(true)
    h.session.user.value={...identity,roles:['operator']};await nextTick();expect(w.find('a[href="/users"]').exists()).toBe(false)
    const status=render(StatusView);expect(status.text()).toContain('Страница не найдена');await status.setProps({forbidden:true});expect(status.text()).toContain('Недостаточно прав')
  })
  it('lists, searches, filters, sorts, paginates, and opens staff editing through item actions',async()=>{
    h.session.listUsers.mockResolvedValue(Array.from({length:12},(_,i)=>({...identity,id:i+1,email:`user${i}@example.test`,firstName:i===0?'Анна':`Имя ${i}`,roles:i===0?['operator']:['administrator'],isActive:i!==0})))
    const w=render(UsersView);await nextTick();await flushPromises();expect(w.findAll('tbody tr')).toHaveLength(10)
    await button(w,'Следующая страница').trigger('click');expect(w.findAll('tbody tr')).toHaveLength(2);await button(w,'Предыдущая страница').trigger('click')
    await w.get('[type=search]').setValue('Анна');expect(w.findAll('tbody tr')).toHaveLength(1)
    await w.get('[type=search]').setValue('');await w.findAll('select')[0].setValue('operator');expect(w.findAll('tbody tr')).toHaveLength(1)
    await w.findAll('select')[0].setValue('');await w.findAll('select')[1].setValue('false');expect(w.findAll('tbody tr')).toHaveLength(1)
    await w.findAll('select')[1].setValue('');await w.findAll('select')[2].setValue('email');await w.findAll('button[aria-label="Редактировать учётную запись"]')[0].trigger('click');expect(h.router.push).toHaveBeenCalledWith('/users/1')
    await button(w,'Добавить сотрудника').trigger('click');expect(h.router.push).toHaveBeenCalledWith('/users/new')
    await w.get('[type=search]').setValue('никого');expect(w.text()).toContain('Сотрудники не найдены')
  })
  it('retries load, cancels disabling and retains errors when the server rejects disabling',async()=>{
    h.session.listUsers.mockRejectedValueOnce(failure());const w=render(UsersView);await flushPromises();expect(w.get('[role=alert]').exists()).toBe(true);await button(w,'Повторить загрузку').trigger('click');await flushPromises()
    await button(w,'Отключить учётную запись').trigger('click');await button(w,'Отмена').trigger('click');expect(h.session.saveUser).not.toHaveBeenCalled()
    await button(w,'Отключить учётную запись').trigger('click');h.session.saveUser.mockRejectedValueOnce(failure());await button(w,'Отключить').trigger('click');await flushPromises();expect(w.get('[role=alert]').exists()).toBe(true)
    await button(w,'Повторить загрузку').trigger('click');await flushPromises();await button(w,'Отключить учётную запись').trigger('click');await button(w,'Отключить').trigger('click');await flushPromises();expect(h.session.saveUser).toHaveBeenCalledWith(1,expect.objectContaining({isActive:false}),expect.objectContaining({id:1}))
    await button(w,'Отключить учётную запись').trigger('click');h.session.saveUser.mockImplementationOnce(()=>{h.session.user.value=null;return Promise.resolve(identity)});await button(w,'Отключить').trigger('click');await flushPromises()
  })
  it('creates accounts with field validation and retains input on failed saves',async()=>{
    h.route={path:'/users/new',params:{},query:{}};const w=render(AccountView);await flushPromises();await w.get('form').trigger('submit');expect(w.get('#roles-error').text()).toContain('Выберите')
    for(const [name,value] of Object.entries({firstName:'Иван',lastName:'Иванов',email:'new@example.test',password:'test-password',confirmation:'test-password'})) await fill(w,name,value)
    await w.get('input[value=operator]').setValue(true);h.session.saveUser.mockRejectedValueOnce(failure());await w.get('form').trigger('submit');await flushPromises();expect(w.get('[name=email]').element.value).toBe('new@example.test');expect(h.router.push).not.toHaveBeenCalled()
    await button(w,'Отмена').trigger('click');expect(h.router.push).toHaveBeenCalledWith('/users');h.router.push.mockClear()
    const wait=pending();h.session.saveUser.mockReturnValueOnce(wait.promise);await w.get('form').trigger('submit');await w.get('form').trigger('submit');wait.resolve(identity);await flushPromises();expect(h.session.saveUser).toHaveBeenCalledTimes(2);expect(h.router.push).toHaveBeenCalledWith('/users')
  })
  it('retries failed account loads and confirms security edits before saving',async()=>{
    h.route={path:'/users/1',params:{id:'1'},query:{}};h.session.getRoles.mockRejectedValueOnce(failure());const w=render(AccountView);await flushPromises();expect(w.find('form').exists()).toBe(false);await button(w,'Повторить загрузку').trigger('click');await flushPromises()
    await fill(w,'firstName','Пётр');await w.get('form').trigger('submit');await flushPromises();expect(h.session.saveUser).toHaveBeenCalledTimes(1)
    await fill(w,'email','new@example.test');await w.get('form').trigger('submit');expect(w.find('[role=alertdialog]').exists()).toBe(true);await w.findComponent(ConfirmDialog).vm.$emit('cancel');await nextTick();expect(h.session.saveUser).toHaveBeenCalledTimes(1)
    await w.get('form').trigger('submit');h.session.saveUser.mockImplementationOnce(()=>{h.session.user.value=null;return Promise.resolve(identity)});await w.findComponent(ConfirmDialog).vm.$emit('confirm');await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/login')
  })
  it('shows self roles read-only, saves names, and confirms password changes',async()=>{
    h.route={path:'/profile',params:{},query:{}};const w=render(AccountView);await flushPromises();expect(h.session.getRoles).not.toHaveBeenCalled();expect(w.get('[name=email]').attributes('readonly')).toBeDefined();expect(w.find('input[name=roles]').exists()).toBe(false)
    await fill(w,'firstName','Пётр');await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=status]').text()).toBe('Данные сохранены');await button(w,'Отмена').trigger('click');expect(h.router.push).toHaveBeenCalledWith('/home')
    await fill(w,'password','test-password');await fill(w,'confirmation','test-password');await w.get('form').trigger('submit');await w.findComponent(ConfirmDialog).vm.$emit('confirm');await flushPromises();expect(h.session.saveProfile).toHaveBeenLastCalledWith(expect.objectContaining({password:'test-password'}))
  })
  it('renders loading/recovery, login and staff shell with independent versions and logout',async()=>{
    h.session.ready.value=false;const w=render(App);await flushPromises();expect(w.text()).toContain('Восстановление сеанса')
    h.session.ready.value=true;h.session.restoreProblem.value=failure();await nextTick();expect(w.get('[role=alert]').exists()).toBe(true)
    await button(w,'Повторить').trigger('click');await flushPromises();expect(h.router.replace).not.toHaveBeenCalled()
    h.session.restoreSession.mockImplementationOnce(()=>{h.session.restoreProblem.value=null;return Promise.resolve()});await button(w,'Повторить').trigger('click');await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/users');expect(w.text()).toContain('Core 0.0.6')
    await button(w,'Свернуть навигацию').trigger('click');expect(w.get('.app-frame').classes()).toContain('nav-collapsed');await button(w,'Развернуть навигацию').trigger('click');expect(w.get('.app-frame').classes()).not.toContain('nav-collapsed')
    await w.get('.menu-button').trigger('click');expect(w.find('.drawer-backdrop').exists()).toBe(true);await w.get('.drawer-backdrop').trigger('click');await w.get('.menu-button').trigger('click');h.router.currentRoute.value={fullPath:'/profile'};await nextTick();expect(w.find('.drawer-backdrop').exists()).toBe(false)
    h.session.user.value={...identity,roles:['operator']};await nextTick();expect(w.find('nav a[href="/users"]').exists()).toBe(false)
    await button(w,'Выйти').trigger('click');expect(h.session.logout).toHaveBeenCalled();await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/login')
    h.session.user.value=null;await nextTick();expect(w.find('.app-frame').exists()).toBe(false)
  })
  it('suppresses version lookup failures and recovers a signed-out session',async()=>{
    h.session.user.value=null;h.session.getStatus.mockRejectedValueOnce(failure());h.session.restoreProblem.value=failure();const w=render(App);await flushPromises()
    h.session.restoreSession.mockImplementationOnce(()=>{h.session.restoreProblem.value=null;return Promise.resolve()});await button(w,'Повторить').trigger('click');await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/login')
  })
})
