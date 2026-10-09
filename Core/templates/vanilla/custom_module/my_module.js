/**
 * ============================================================================
 * custom_module/my_module.js
 * ============================================================================
 * JavaScript wrapper for custom native C module 'myModule'.
 * ============================================================================
 */

import { ritaRpc } from '../src/rpc.js';

export const myModule = {
  /**
   * Calls native 'hello' in C.
   */
  async hello() {
    return await ritaRpc('myModule', 'hello');
  },

  /**
   * Calls native 'addNumbers' in C.
   */
  async addNumbers(a, b) {
    return await ritaRpc('myModule', 'addNumbers', a, b);
  },

  /**
   * Calls native Win32 GetTickCount() in C.
   */
  async getSystemTicks() {
    return await ritaRpc('myModule', 'getSystemTicks');
  }
};
