# RitaWapp Custom Modules Guide (Vanilla JS)

This directory allows developers to extend their RitaWapp desktop application with custom native C code, hardware drivers, Win32 APIs, or high-performance algorithms.

---

## How It Works

1. **Automatic Discovery**: The RitaWapp compiler automatically scans `custom_module/` during `rwa dev` and `rwa build`. Any `.c` files found here are compiled and linked directly into your native executable.
2. **Registration Hook**: The C runtime provides a weak symbol `register_custom_user_modules(void)`. When you define this function in your `.c` file, it overrides the weak symbol and is called during application initialization.
3. **Bridge Dispatch**: When your frontend calls `ritaRpc('myModule', 'hello')`, the WebUI C router immediately directs the call to your C handler `handle_my_custom_module(...)`.

---

## File Structure

```text
custom_module/
├── my_module.c       # Native C implementation and registration hook
├── my_module.h       # C header prototypes
├── my_module.js      # JavaScript wrapper for frontend scripts
└── README.md         # This documentation
```

---

## Usage Example in `src/main.js`

```javascript
import { myModule } from '../custom_module/my_module.js';

const res = await myModule.hello();
console.log(res.message);

const ticks = await myModule.getSystemTicks();
console.log('System ticks:', ticks.tickCount);
```
