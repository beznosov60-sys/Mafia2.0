<template>
  <header class="app-header">
    <div class="brand">Mafia CRM</div>
    <nav class="nav-links">
      <RouterLink to="/">Поиск</RouterLink>
      <RouterLink to="/clients/add">Новый клиент</RouterLink>
      <RouterLink to="/calendar">Календарь</RouterLink>
      <RouterLink to="/finance">Финансы</RouterLink>
      <RouterLink to="/managers">Менеджеры</RouterLink>
    </nav>
  </header>
</template>

<script setup>
import { RouterLink } from 'vue-router';
</script>

<style scoped lang="scss">
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 2rem;
  background-color: #fff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.brand {
  font-size: 1.25rem;
  font-weight: 700;
  color: #222;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
}

.nav-links a {
  font-weight: 600;
  color: #444;
  text-decoration: none;
  position: relative;
  padding-bottom: 0.25rem;
}

.nav-links a.router-link-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.2rem;
  height: 2px;
  background-color: #4f46e5;
}

.nav-links a:hover {
  color: #1f2937;
}
</style>
