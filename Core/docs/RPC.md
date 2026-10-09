# RitaWapp RPC Protocol Specification (v1.0.1)

## 1. Overview

The RitaWapp native bridge facilitates communication between the frontend
JavaScript environment and the native C11 runtime via WebUI.

## 2. Framing

Requests and responses use standard JSON-RPC 2.0 envelopes:

- **Request**:
  ```json
  {
    "id": 1,
    "module": "fs",
    "action": "readFile",
    "args": ["data/config.json"]
  }
  ```
- **Success Response**:
  ```json
  {
    "id": 1,
    "result": { "content": "..." },
    "success": true
  }
  ```
- **Error Response**:
  ```json
  {
    "id": 1,
    "error": {
      "code": "E_DISABLED_MODULE",
      "message": "[RitaWapp Module] Module 'fs' is disabled in RitaWapp.config.ts"
    },
    "success": false
  }
  ```

## 3. Error Codes

- `E_DISABLED_MODULE`: Target module is disabled in configuration.
- `E_UNKNOWN_ACTION`: Action not registered on target module.
- `E_INVALID_PARAMS`: Invalid arguments payload.
- `E_TIMEOUT`: Call exceeded deadline.
- `E_CANCELLED`: Operation cancelled by caller.
- `E_PERMISSION`: Action prohibited by security policy.
- `E_INTERNAL`: Native execution or memory failure.
