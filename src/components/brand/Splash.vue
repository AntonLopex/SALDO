<script setup lang="ts">
import Logo from './Logo.vue'
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-bg" aria-hidden="true">
    <Logo :size="88" wordmark animate />
  </div>
</template>
