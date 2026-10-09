# RitaWapp Custom Modules Guide

This directory allows developers to extend their RitaWapp desktop application with custom native C code, hardware drivers, Win32 APIs, or high-performance algorithms.

---

## How It Works

1. **Automatic Discovery**: The RitaWapp compiler automatically scans `custom_module/` during `rwa dev` and `rwa build`. Any `.c` files found here are compiled and linked directly into your native executable.
2. **Registration Hook**: The C runtime provides a weak symbol `register_custom_user_modules(void)`. When you define this function in your `.c` file, it overrides the weak symbol and is called during application initialization.
3. **Bridge Dispatch**: When your frontend executes `window.rita_module_call(JSON.stringify({ module: "myModule", action: "hello", args: [] }))`, the WebUI C router immediately directs the call to your C handler `handle_my_custom_module(...)`.

---

## File Structure

```text
custom_module/
├── my_module.c       # Native C implementation and registration hook
├── my_module.h       # C header prototypes
├── my_module.ts      # TypeScript wrapper for Vue 3 components
└── README.md         # This documentation
```

---

## Step-by-Step: Adding a New Custom Function

### 1. In `my_module.c`:
Add your action handler logic:
```c
if (strcmp(action, "getSystemTicks") == 0) {
    DWORD ticks = GetTickCount();
    snprintf(response, max_resp,
        "{\"success\":true,\"data\":{\"tickCount\":%lu}}",
        (unsigned long)ticks
    );
    return;
}
```

### 2. In `my_module.ts`:
Expose the function to Vue 3:
```typescript
export const myModule = {
  async getSystemTicks(): Promise<{ tickCount: number }> {
    return await callCustomModule("getSystemTicks");
  }
};
```

### 3. In your Vue 3 component (`App.vue`):
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { myModule } from '../custom_module/my_module';

const ticks = ref<number>(0);

async function fetchTicks() {
  const res = await myModule.getSystemTicks();
  ticks.value = res.tickCount;
}
</script>

<template>
  <button @click="fetchTicks">Get Win32 Ticks: {{ ticks }}</button>
</template>
```
