import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../pages/Home/Home.vue')
    },
    {
      path: '/clients/add',
      name: 'add-client',
      component: () => import('../pages/AddClient/AddClient.vue')
    },
    {
      path: '/clients/:id',
      name: 'client-card',
      component: () => import('../pages/ClientCard/ClientCard.vue'),
      props: true
    },
    {
      path: '/clients/:id/edit',
      name: 'edit-client',
      component: () => import('../pages/EditClient/EditClient.vue'),
      props: true
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: () => import('../pages/Calendar/Calendar.vue')
    },
    {
      path: '/finance',
      name: 'finance',
      component: () => import('../pages/Finance/Finance.vue')
    },
    {
      path: '/managers',
      name: 'managers',
      component: () => import('../pages/Managers/Managers.vue')
    }
  ],
  scrollBehavior() {
    return { top: 0 };
  }
});

export default router;
