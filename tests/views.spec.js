// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ref, defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createSarafanVuetify } from '../src/plugins/vuetify.js'
import { createInternalProblem } from '../src/errors/problem.js'
import LoginView from '../src/views/LoginView.vue'
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
const roles=[{code:'operator',displayName:'Operator'},{code:'senior-operator',displayName:'Senior operator'},{code:'administrator',displayName:'Administrator'},{code:'shift-manager',displayName:'Shift manager'}]
const failure=()=>createInternalProblem('networkUnavailable')
const pending=()=>{let resolve;return {promise:new Promise(r=>{resolve=r}),resolve:(v)=>resolve(v)}}
const stubs={
  VTooltip:defineComponent({name:'VTooltip',props:['disabled','openDelay','text','location','offset','maxWidth','contentClass'],template:'<div><slot name="activator" :props="{}"/><slot/></div>'}),
  VIcon:defineComponent({props:['icon','size'],template:'<i :data-icon="icon"/>'}),
  VProgressCircular:defineComponent({template:'<i class="progress"/>'}),
  VDialog:defineComponent({name:'VDialog',props:['modelValue'],emits:['update:modelValue'],template:'<div v-if="modelValue"><slot/></div>'}),
  VApp:defineComponent({template:'<div><slot/></div>'}),
  VAppBar:defineComponent({template:'<header><slot name="prepend"/><slot/></header>'}),
  VAppBarNavIcon:defineComponent({emits:['click'],template:'<button type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"/>'}),
  VAppBarTitle:defineComponent({template:'<div><slot/></div>'}),
  VNavigationDrawer:defineComponent({name:'VNavigationDrawer',props:['modelValue','permanent','temporary'],emits:['update:modelValue'],template:'<aside :data-open="modelValue"><slot name="prepend"/><slot/><slot name="append"/></aside>'}),
  VList:defineComponent({template:'<nav><slot/></nav>'}),
  VListItem:defineComponent({name:'VListItem',props:['to','title','tag','prependIcon'],emits:['click'],template:'<a v-if="to" :href="to"><i :data-icon="prependIcon"/>{{ title }}<slot/></a><button v-else type="button" @click="$emit(\'click\')"><i :data-icon="prependIcon"/>{{ title }}<slot/></button>'}),
  VMain:defineComponent({template:'<div><slot/></div>'}),
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
  h.session={user:ref({...identity}),ready:ref(true),restoring:ref(false),restoreProblem:ref(null),notice:ref(''),loginProblem:ref(null),
    login:vi.fn().mockResolvedValue(identity),logout:vi.fn().mockResolvedValue(),restoreSession:vi.fn().mockResolvedValue(),
    listUsers:vi.fn().mockResolvedValue([{...identity},{...identity,id:2,firstName:'Анна',email:'anna@example.test',roles:['operator'],isActive:false}]),
    getUser:vi.fn().mockResolvedValue({...identity}),getRoles:vi.fn().mockResolvedValue(roles),getStatus:vi.fn().mockResolvedValue({appVersion:'0.0.6'}),saveUser:vi.fn().mockResolvedValue(identity),saveProfile:vi.fn().mockResolvedValue(identity)}
})
afterEach(()=>{for(const w of wrappers.splice(0)) w.unmount()})

describe('ActionButton pattern',()=>{
  it('emits its item, preserves attrs/classes, labels icons and explains disabled actions',async()=>{
    const item={id:3};const w=render(ActionButton,{props:{item,icon:'$edit',tooltipText:'Изменить'},attrs:{class:'extra','data-test':'action'}})
    expect(w.findComponent({name:'VTooltip'}).props()).toMatchObject({text:'Изменить',location:'top',offset:8,maxWidth:320,contentClass:'action-tooltip-content'})
    await button(w,'Изменить').trigger('click');expect(w.emitted('click')).toEqual([[item]]);expect(w.get('button').classes()).toContain('extra');expect(w.get('button').attributes('data-test')).toBe('action')
    await w.setProps({disabled:true});expect(w.get('.action-button-disabled').attributes()).toMatchObject({tabindex:'0','aria-disabled':'true','aria-label':'Изменить'})
    await w.setProps({'data-test':'updated'});expect(w.get('button').attributes('data-test')).toBe('updated')
    await button(w,'Изменить').trigger('click');expect(w.emitted('click')).toHaveLength(1)
    await w.setProps({disabled:false,loading:true,label:'Сохранить',variant:'blue'});expect(w.find('.progress').exists()).toBe(true);expect(w.get('button').attributes('aria-busy')).toBe('true')
    await w.setProps({loading:false,disabled:true,tooltipText:'   ',type:'submit'});expect(w.findComponent(stubs.VTooltip).props('disabled')).toBe(true);expect(w.get('.action-button-activator').attributes('tabindex')).toBeUndefined();expect(w.get('button').attributes('aria-label')).toBe('Сохранить');expect(w.get('button').attributes('type')).toBe('submit')
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
  it('renders service unavailability as a red login error',async()=>{
    h.route={path:'/login',params:{},query:{}};h.session.loginProblem.value=createInternalProblem('serviceUnavailable')
    const w=render(LoginView);expect(w.get('.page-alert').text()).toBe('Сервис недоступен. Пожалуйста, повторите позже.');expect(w.find('.page-notice').exists()).toBe(false)
  })
  it('validates login, reveals password, preserves failed fields, and navigates only on success',async()=>{
    h.route={path:'/login',params:{},query:{return:'/users/2'}};h.session.notice.value='Войдите повторно'
    const w=render(LoginView);await w.get('form').trigger('submit');expect(w.findAll('.field-error').some(e=>e.text())).toBe(true);expect(w.find('[role=alert]').exists()).toBe(false)
    await fill(w,'email','a@b.test');await fill(w,'password','test-password');expect(w.get('[name=password]').attributes('type')).toBe('password');expect(w.get('i[data-icon="$eye"]').exists()).toBe(true);await button(w,'Показать пароль').trigger('click');expect(w.get('[name=password]').attributes('type')).toBe('text');expect(w.get('i[data-icon="$eyeOff"]').exists()).toBe(true);await button(w,'Скрыть пароль').trigger('click');expect(w.get('[name=password]').attributes('type')).toBe('password')
    h.session.login.mockRejectedValueOnce(failure());await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=alert]').text()).toContain('Проверьте');expect(w.get('[name=password]').element.value).toBe('test-password');expect(h.router.replace).not.toHaveBeenCalled()
    h.session.login.mockClear();const wait=pending();h.session.login.mockReturnValueOnce(wait.promise);await w.get('form').trigger('submit');await w.get('form').trigger('submit');expect(h.session.login).toHaveBeenCalledTimes(1);wait.resolve(identity);await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/users/2')
    h.session.login.mockResolvedValueOnce(null);await w.get('form').trigger('submit');await flushPromises();expect(h.router.replace).toHaveBeenCalledTimes(1)
  })
  it('returns from missing and forbidden pages to the role work screen',async()=>{
    const status=render(StatusView);expect(status.text()).toContain('Страница не найдена');expect(status.get('a').attributes('href')).toBe('/users')
    await status.setProps({forbidden:true});expect(status.text()).toContain('Недостаточно прав')
    h.session.user.value={...identity,roles:['operator']};await nextTick();expect(status.get('a').attributes('href')).toBe('/profile')
  })
  it('lists, searches, filters, sorts, paginates, and opens staff editing through item actions',async()=>{
    h.session.listUsers.mockResolvedValue(Array.from({length:12},(_,i)=>({...identity,id:i+1,email:`user${i}@example.test`,firstName:i===0?'Анна':`Имя ${i}`,roles:i===0?['operator']:['administrator'],isActive:i!==0})))
    const w=render(UsersView);await nextTick();await flushPromises();expect(w.findAll('tbody tr')).toHaveLength(10);const filterBar=w.get('.filter-bar');expect(filterBar.findComponent({name:'VTextField'}).props()).toMatchObject({label:'Поиск по любой информации о пользователе',density:'compact',variant:'solo',active:true});expect(filterBar.findAllComponents({name:'VSelect'}).every(select=>select.props('density')==='compact'&&select.props('variant')==='solo'&&select.props('active')===true)).toBe(true)
    const table=w.findComponent({name:'VDataTable'});table.vm.$emit('update:page',2);await nextTick();expect(w.findAll('tbody tr')).toHaveLength(2);table.vm.$emit('update:page',1);await nextTick()
    await w.get('.filter-search input').setValue('Анна');expect(w.findAll('tbody tr')).toHaveLength(1)
    await w.get('.filter-search input').setValue('');const selects=w.findAllComponents({name:'VSelect'});selects[0].vm.$emit('update:modelValue','operator');await nextTick();expect(w.findAll('tbody tr')).toHaveLength(1)
    selects[0].vm.$emit('update:modelValue','');selects[1].vm.$emit('update:modelValue','false');await nextTick();expect(w.findAll('tbody tr')).toHaveLength(1)
    selects[1].vm.$emit('update:modelValue','');table.vm.$emit('update:sortBy',[{key:'email',order:'desc'}]);await nextTick();await w.findAll('button[aria-label="Редактировать учётную запись"]')[0].trigger('click');expect(h.router.push).toHaveBeenCalledWith('/users/10')
    expect(button(w,'Добавить пользователя').get('i').attributes('data-icon')).toBe('$addUser');await button(w,'Добавить пользователя').trigger('click');expect(h.router.push).toHaveBeenCalledWith('/users/new')
    await w.get('.filter-search input').setValue('никого');expect(w.text()).toContain('Пользователи не найдены')
  })
  it('retries load, cancels disabling and retains errors when the server rejects disabling',async()=>{
    const operator={...identity,id:2,firstName:'Анна',email:'anna@example.test',roles:['operator'],isActive:true}
    h.session.listUsers.mockResolvedValue([{...identity},operator]);h.session.getUser.mockResolvedValue(operator)
    h.session.listUsers.mockRejectedValueOnce(failure());const w=render(UsersView);await flushPromises();expect(w.get('[role=alert]').exists()).toBe(true);await button(w,'Повторить загрузку').trigger('click');await flushPromises()
    await button(w,'Отключить учётную запись').trigger('click');await button(w,'Отмена').trigger('click');expect(h.session.saveUser).not.toHaveBeenCalled()
    await button(w,'Отключить учётную запись').trigger('click');h.session.saveUser.mockRejectedValueOnce(failure());await button(w,'Отключить').trigger('click');await flushPromises();expect(w.get('[role=alert]').exists()).toBe(true)
    await button(w,'Повторить загрузку').trigger('click');await flushPromises();await button(w,'Отключить учётную запись').trigger('click');await button(w,'Отключить').trigger('click');await flushPromises();expect(h.session.saveUser).toHaveBeenCalledWith(2,expect.objectContaining({isActive:false}),expect.objectContaining({id:2}))
    await button(w,'Отключить учётную запись').trigger('click');h.session.saveUser.mockImplementationOnce(()=>{h.session.user.value=null;return Promise.resolve(identity)});await button(w,'Отключить').trigger('click');await flushPromises()
  })
  it('prevents disabling the last active administrator and explains why',async()=>{
    const operator={...identity,id:2,roles:['operator'],isActive:true}
    h.session.listUsers.mockResolvedValue([{...identity},operator,{...identity,id:3,roles:['administrator'],isActive:false}])
    const w=render(UsersView);await flushPromises()
    const protectedAction=button(w,'Нельзя отключить последнего активного администратора')
    expect(protectedAction.attributes('disabled')).toBeDefined();expect(protectedAction.element.closest('.action-button-disabled')).not.toBeNull()
    await protectedAction.trigger('click');expect(w.findComponent(ConfirmDialog).props('open')).toBe(false);expect(h.session.saveUser).not.toHaveBeenCalled()
    expect(button(w,'Отключить учётную запись').attributes('disabled')).toBeUndefined()
  })
  it('clears stale staff counts when reloading after a successful change fails',async()=>{
    const operator={...identity,id:2,roles:['operator'],isActive:true}
    h.session.getUser.mockResolvedValue(operator);h.session.listUsers.mockResolvedValueOnce([operator]).mockRejectedValueOnce(failure())
    const w=render(UsersView);await flushPromises();expect(w.get('.count').text()).toBe('1')
    await button(w,'Отключить учётную запись').trigger('click');await button(w,'Отключить').trigger('click');await flushPromises()
    expect(w.get('.count').text()).toBe('0');expect(w.find('table').exists()).toBe(false);expect(w.get('[role=alert]').exists()).toBe(true)
    await button(w,'Повторить загрузку').trigger('click');await flushPromises();expect(w.get('.count').text()).toBe('2')
  })
  it('creates accounts with field validation and retains input on failed saves',async()=>{
    h.route={path:'/users/new',params:{},query:{}};const w=render(AccountView);await flushPromises();expect(w.get('.primary-heading').text()).toBe('Регистрация пользователя');expect(w.findAll('.role-options label').map(label=>label.text())).toEqual(['Администратор','Старший смены','Старший оператор','Оператор']);expect(w.text()).not.toContain('Имя и фамилия обязательны');expect(w.text()).not.toContain('Можно выбрать несколько ролей');await w.get('form').trigger('submit');expect(w.get('#firstName-error').text()).toBe('Имя обязательно');expect(w.get('#lastName-error').text()).toBe('Фамилия обязательна');expect(w.get('#roles-error').text()).toContain('Выберите');expect(w.find('[role=alert]').exists()).toBe(false)
    for(const [name,value] of Object.entries({firstName:'Иван',lastName:'Иванов',email:'new@example.test',password:'test-password',confirmation:'test-password'})) await fill(w,name,value)
    await w.get('input[value=operator]').setValue(true);h.session.saveUser.mockRejectedValueOnce(failure());await w.get('form').trigger('submit');await flushPromises();expect(w.get('[name=email]').element.value).toBe('new@example.test');expect(h.router.push).not.toHaveBeenCalled()
    await button(w,'Отменить').trigger('click');expect(h.router.push).toHaveBeenCalledWith('/users');h.router.push.mockClear()
    h.session.saveUser.mockClear();const wait=pending();h.session.saveUser.mockReturnValueOnce(wait.promise);await w.get('form').trigger('submit');await w.get('form').trigger('submit');wait.resolve(identity);await flushPromises();expect(h.session.saveUser).toHaveBeenCalledTimes(1);expect(h.router.push).toHaveBeenCalledWith('/users')
  })
  it('retries failed account loads and confirms security edits before saving',async()=>{
    h.route={path:'/users/1',params:{id:'1'},query:{}};h.session.getRoles.mockRejectedValueOnce(failure());const w=render(AccountView);await flushPromises();expect(w.find('form').exists()).toBe(false);await button(w,'Повторить загрузку').trigger('click');await flushPromises()
    expect(w.get('.primary-heading').text()).toBe('Изменить информацию о пользователе');expect(button(w,'Сохранить изменения').get('i').attributes('data-icon')).toBe('$saveChanges')
    const reveal=w.findAll('button[aria-label="Показать пароль"]');expect(reveal).toHaveLength(2);expect(w.get('[name=password]').attributes('type')).toBe('password');expect(w.get('[name=confirmation]').attributes('type')).toBe('password');await reveal[0].trigger('click');expect(w.get('[name=password]').attributes('type')).toBe('text');expect(w.get('[name=confirmation]').attributes('type')).toBe('password');expect(w.get('button[aria-label="Скрыть пароль"] i').attributes('data-icon')).toBe('$eyeOff')
    await fill(w,'firstName','Пётр');await w.get('form').trigger('submit');await flushPromises();expect(h.session.saveUser).toHaveBeenCalledTimes(1)
    await fill(w,'email','new@example.test');await w.get('form').trigger('submit');expect(w.find('[role=alertdialog]').exists()).toBe(true);await w.findComponent(ConfirmDialog).vm.$emit('cancel');await nextTick();expect(h.session.saveUser).toHaveBeenCalledTimes(1)
    await w.get('form').trigger('submit');h.session.saveUser.mockImplementationOnce(()=>{h.session.user.value=null;return Promise.resolve(identity)});await w.findComponent(ConfirmDialog).vm.$emit('confirm');await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/login')
  })
  it('locks administrator role and active status for the last active administrator',async()=>{
    h.route={path:'/users/1',params:{id:'1'},query:{}}
    const w=render(AccountView);await flushPromises()
    expect(w.get('#last-administrator-note').text()).toContain('нельзя отключить или лишить роли')
    expect(w.get('input[value=administrator]').attributes('disabled')).toBeDefined()
    expect(w.get('input[name=isActive]').attributes('disabled')).toBeDefined()
    expect(w.get('input[value=operator]').attributes('disabled')).toBeUndefined()

    h.session.listUsers.mockResolvedValue([{...identity},{...identity,id:2}])
    const editable=render(AccountView);await flushPromises()
    expect(editable.find('#last-administrator-note').exists()).toBe(false)
    expect(editable.get('input[value=administrator]').attributes('disabled')).toBeUndefined()
    expect(editable.get('input[name=isActive]').attributes('disabled')).toBeUndefined()
  })
  it('shows self roles read-only, saves names, and confirms password changes',async()=>{
    h.route={path:'/profile',params:{},query:{}};const w=render(AccountView);await flushPromises();expect(w.get('.primary-heading').text()).toBe('Профиль');expect(h.session.getRoles).not.toHaveBeenCalled();expect(w.get('[name=email]').attributes('readonly')).toBeDefined();expect(w.find('input[name=roles]').exists()).toBe(false)
    await fill(w,'firstName','Пётр');await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=status]').text()).toBe('Данные сохранены');await button(w,'Отменить').trigger('click');expect(h.router.push).toHaveBeenCalledWith('/users')
    await fill(w,'password','test-password');await fill(w,'confirmation','test-password');await w.get('form').trigger('submit');await w.findComponent(ConfirmDialog).vm.$emit('confirm');await flushPromises();expect(h.session.saveProfile).toHaveBeenLastCalledWith(expect.objectContaining({password:'test-password'}))
  })
  it('discards operator profile edits when cancel returns to the same work screen',async()=>{
    h.session.user.value={...identity,roles:['operator']};h.route={path:'/profile',params:{},query:{}};const w=render(AccountView);await flushPromises();await fill(w,'firstName','Изменено');await fill(w,'password','test-password');await button(w,'Отменить').trigger('click');expect(w.get('[name=firstName]').element.value).toBe('Иван');expect(w.get('[name=password]').element.value).toBe('');expect(h.router.push).not.toHaveBeenCalled()
  })
  it('renders loading/recovery, login and staff shell with independent versions and logout',async()=>{
    h.session.ready.value=false;const w=render(App);await flushPromises();expect(w.text()).toContain('Восстановление сеанса')
    h.session.ready.value=true;h.session.restoreProblem.value=failure();await nextTick();expect(w.get('[role=alert]').exists()).toBe(true)
    await button(w,'Повторить').trigger('click');await flushPromises();expect(h.router.replace).not.toHaveBeenCalled()
    h.session.restoreSession.mockImplementationOnce(()=>{h.session.restoreProblem.value=null;return Promise.resolve()});await button(w,'Повторить').trigger('click');await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/users');expect(w.text()).toContain('Сервер 0.0.6');expect(w.text()).toContain('Клиент 0.0.1');expect(w.text()).toContain('Иванов Иван');expect(w.find('nav a[href="/users"] i').attributes('data-icon')).toBe('$staff');expect(w.find('nav a[href="/users/1"] i').attributes('data-icon')).toBe('$profile')
    const drawer=w.findComponent({name:'VNavigationDrawer'});expect(drawer.props('permanent')).toBe(true);const initiallyOpen=drawer.props('modelValue');await button(w,'Открыть меню').trigger('click');expect(drawer.props('modelValue')).toBe(!initiallyOpen)
    Object.defineProperty(globalThis.window,'innerWidth',{configurable:true,writable:true,value:390});globalThis.window.dispatchEvent(new globalThis.Event('resize'));await nextTick();expect(drawer.props('temporary')).toBe(true);expect(drawer.props('modelValue')).toBe(false);await button(w,'Открыть меню').trigger('click');expect(drawer.props('modelValue')).toBe(true);h.router.currentRoute.value={fullPath:'/profile'};await nextTick();expect(drawer.props('modelValue')).toBe(false);Object.defineProperty(globalThis.window,'innerWidth',{configurable:true,writable:true,value:1024});globalThis.window.dispatchEvent(new globalThis.Event('resize'));await nextTick()
    expect(w.find('nav a[href="/users"]').exists()).toBe(true);h.session.user.value={...identity,roles:['operator']};await nextTick();expect(w.find('nav a[href="/users"]').exists()).toBe(false);expect(w.find('nav a[href="/profile"]').exists()).toBe(true)
    await button(w,'Выйти').trigger('click');expect(h.session.logout).toHaveBeenCalled();await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/login')
    h.session.user.value=null;await nextTick();expect(w.find('.app-bar').exists()).toBe(false)
  })
  it('suppresses version lookup failures and recovers a signed-out session',async()=>{
    h.session.user.value=null;h.session.getStatus.mockRejectedValueOnce(failure());h.session.restoreProblem.value=failure();const w=render(App);await flushPromises()
    h.session.restoreSession.mockImplementationOnce(()=>{h.session.restoreProblem.value=null;return Promise.resolve()});await button(w,'Повторить').trigger('click');await flushPromises();expect(h.router.replace).toHaveBeenCalledWith('/login')
  })
})
