<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterView } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
</script>

<style scoped lang="scss">
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f4f5f8;
}

.app-main {
  flex: 1;
  padding: 2rem;
}
</style>
