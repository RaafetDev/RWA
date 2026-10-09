/**
 * ============================================================================
 * Core/runtime/core/packer.c
 * ============================================================================
 * Native C Bundler & AES-256-GCM Encryptor for RitaWapp v1.0.1
 * Wide-Character Unicode Compliant (supports arbitrary paths with spaces, Arabic, CJK)
 * ============================================================================
 */

#include <winsock2.h>
#include <windows.h>
#include <bcrypt.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <wchar.h>

#ifndef BCRYPT_SUCCESS
#define BCRYPT_SUCCESS(Status) (((NTSTATUS)(Status)) >= 0)
#endif

#pragma pack(push, 1)
typedef struct {
    char magic[4];          // 'R', 'W', 'A', 'P'
    uint8_t version;        // 0x02
    uint8_t cipher;         // 0x02 = AES-256-GCM
    uint16_t flags;         // Reserved (0x0000)
    uint64_t original_size; // Plaintext size in bytes
    uint8_t nonce[12];      // 96-bit Nonce
    uint8_t tag[16];        // 128-bit GCM Auth Tag
} RitaGCMContainerHeader;
#pragma pack(pop)

#define RWAP_GCM_HEADER_SIZE sizeof(RitaGCMContainerHeader)

static bool hex_to_bytes(const wchar_t* hex_w, uint8_t* out_bytes, size_t out_len) {
    if (!hex_w || wcslen(hex_w) != out_len * 2) return false;
    for (size_t i = 0; i < out_len; i++) {
        wchar_t byte_str[3] = { hex_w[i * 2], hex_w[i * 2 + 1], L'\0' };
        wchar_t* end = NULL;
        long val = wcstol(byte_str, &end, 16);
        if (end != byte_str + 2 || val < 0 || val > 255) return false;
        out_bytes[i] = (uint8_t)val;
    }
    return true;
}

static uint8_t* read_binary_file_w(const wchar_t* filename, size_t* out_size) {
    FILE* f = _wfopen(filename, L"rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0) { fclose(f); return NULL; }

    uint8_t* buf = (uint8_t*)malloc(sz);
    if (!buf) { fclose(f); return NULL; }
    size_t read_bytes = fread(buf, 1, sz, f);
    fclose(f);
    if (read_bytes != (size_t)sz) { free(buf); return NULL; }
    *out_size = (size_t)sz;
    return buf;
}

static bool write_binary_file_w(const wchar_t* filename, const uint8_t* data, size_t size) {
    FILE* f = _wfopen(filename, L"wb");
    if (!f) return false;
    size_t written = fwrite(data, 1, size, f);
    fclose(f);
    return written == size;
}

/**
 * Encrypt file to Rita.W.app container using native Windows BCrypt AES-256-GCM
 */
static int cmd_encrypt_gcm(const wchar_t* in_file, const wchar_t* out_file, const wchar_t* key_hex) {
    uint8_t key_bytes[32];
    if (!hex_to_bytes(key_hex, key_bytes, 32)) {
        fwprintf(stderr, L"[RitaWapp Packer Error] Invalid 256-bit AES key (must be 64 hex characters)\n");
        return 1;
    }

    size_t plain_size = 0;
    uint8_t* plain_data = read_binary_file_w(in_file, &plain_size);
    if (!plain_data) {
        fwprintf(stderr, L"[RitaWapp Packer Error] Could not read input file: %ls\n", in_file);
        SecureZeroMemory(key_bytes, sizeof(key_bytes));
        return 1;
    }

    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_KEY_HANDLE hKey = NULL;
    NTSTATUS status;

    status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, NULL, 0);
    if (!BCRYPT_SUCCESS(status)) {
        fwprintf(stderr, L"[RitaWapp Packer Error] BCryptOpenAlgorithmProvider failed: 0x%08lx\n", status);
        free(plain_data);
        SecureZeroMemory(key_bytes, sizeof(key_bytes));
        return 1;
    }

    status = BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0);
    if (!BCRYPT_SUCCESS(status)) {
        fwprintf(stderr, L"[RitaWapp Packer Error] BCryptSetProperty(GCM) failed: 0x%08lx\n", status);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        free(plain_data);
        SecureZeroMemory(key_bytes, sizeof(key_bytes));
        return 1;
    }

    status = BCryptGenerateSymmetricKey(hAlg, &hKey, NULL, 0, (PUCHAR)key_bytes, 32, 0);
    SecureZeroMemory(key_bytes, sizeof(key_bytes));
    if (!BCRYPT_SUCCESS(status)) {
        fwprintf(stderr, L"[RitaWapp Packer Error] BCryptGenerateSymmetricKey failed: 0x%08lx\n", status);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        free(plain_data);
        return 1;
    }

    uint8_t nonce[12];
    BCryptGenRandom(NULL, nonce, sizeof(nonce), BCRYPT_USE_SYSTEM_PREFERRED_RNG);

    uint8_t tag[16];
    memset(tag, 0, sizeof(tag));

    BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO authInfo;
    BCRYPT_INIT_AUTH_MODE_INFO(authInfo);
    authInfo.pbNonce = nonce;
    authInfo.cbNonce = sizeof(nonce);
    authInfo.pbTag = tag;
    authInfo.cbTag = sizeof(tag);

    uint8_t* ciphertext = (uint8_t*)malloc(plain_size);
    if (!ciphertext) {
        fwprintf(stderr, L"[RitaWapp Packer Error] Out of memory allocating ciphertext\n");
        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        free(plain_data);
        return 1;
    }

    ULONG cipher_bytes = 0;
    status = BCryptEncrypt(
        hKey, (PUCHAR)plain_data, (ULONG)plain_size, &authInfo, NULL, 0,
        (PUCHAR)ciphertext, (ULONG)plain_size, &cipher_bytes, 0
    );

    BCryptDestroyKey(hKey);
    BCryptCloseAlgorithmProvider(hAlg, 0);
    free(plain_data);

    if (!BCRYPT_SUCCESS(status)) {
        fwprintf(stderr, L"[RitaWapp Packer Error] BCryptEncrypt(GCM) failed: 0x%08lx\n", status);
        free(ciphertext);
        return 1;
    }

    size_t container_size = RWAP_GCM_HEADER_SIZE + cipher_bytes;
    uint8_t* container = (uint8_t*)malloc(container_size);
    if (!container) {
        fwprintf(stderr, L"[RitaWapp Packer Error] Out of memory allocating container\n");
        free(ciphertext);
        return 1;
    }

    RitaGCMContainerHeader header;
    memcpy(header.magic, "RWAP", 4);
    header.version = 2;
    header.cipher = 2; // AES-256-GCM
    header.flags = 0;
    header.original_size = (uint64_t)plain_size;
    memcpy(header.nonce, nonce, 12);
    memcpy(header.tag, tag, 16);

    memcpy(container, &header, RWAP_GCM_HEADER_SIZE);
    memcpy(container + RWAP_GCM_HEADER_SIZE, ciphertext, cipher_bytes);
    free(ciphertext);

    if (!write_binary_file_w(out_file, container, container_size)) {
        fwprintf(stderr, L"[RitaWapp Packer Error] Could not write container to: %ls\n", out_file);
        free(container);
        return 1;
    }

    free(container);
    wprintf(L"[RitaWapp Packer] Successfully encrypted %zu bytes into AES-256-GCM container %ls (%zu bytes)\n",
        plain_size, out_file, container_size);
    return 0;
}

int wmain(int argc, wchar_t* argv[]) {
    if (argc < 2) {
        wprintf(L"Usage:\n");
        wprintf(L"  packer encrypt <input_file> <output_container> <hex_key_256>\n");
        return 1;
    }

    if (wcscmp(argv[1], L"encrypt") == 0) {
        if (argc < 5) {
            fwprintf(stderr, L"Usage: packer encrypt <input_file> <output_container> <hex_key_256>\n");
            return 1;
        }
        return cmd_encrypt_gcm(argv[2], argv[3], argv[4]);
    }

    fwprintf(stderr, L"Unknown command: %ls\n", argv[1]);
    return 1;
}

int main(int argc, char* argv[]) {
    (void)argc;
    (void)argv;
    int wargc = 0;
    wchar_t** wargv = CommandLineToArgvW(GetCommandLineW(), &wargc);
    if (!wargv) return 1;
    int res = wmain(wargc, wargv);
    LocalFree(wargv);
    return res;
}
