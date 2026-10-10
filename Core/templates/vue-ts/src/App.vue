<template>
  <div class="app-window">
    <!-- Custom Draggable Frameless Title Bar -->
    <header class="titlebar" @mousedown="handleTitlebarMouseDown" @dblclick="handleMaximize">
      <div class="titlebar-left">
        <img :src="appIconSrc" alt="RitaWapp" class="app-icon" />
        <span class="app-title">RitaWapp <span class="tag">{{ webUI.isFrameless() ? 'Frameless Antigravity' : 'Desktop Browser Mode' }}</span></span>
      </div>

      <!-- Window Drag Region Indicator -->
      <div class="titlebar-center">
        <span class="drag-hint">✣ Drag Window Header</span>
      </div>

      <!-- Frameless Native Window Action Controls -->
      <div class="titlebar-controls" style="-webkit-app-region: no-drag" @mousedown.stop>
        <button class="win-btn win-minimize" style="-webkit-app-region: no-drag" @mousedown.stop @click.stop="handleMinimize" title="Minimize">−</button>
        <button class="win-btn win-maximize" style="-webkit-app-region: no-drag" @mousedown.stop @click.stop="handleMaximize" :title="isMaximized ? 'Restore' : 'Maximize'">{{ isMaximized ? '❐' : '□' }}</button>
        <button class="win-btn win-close" style="-webkit-app-region: no-drag" @mousedown.stop @click.stop="handleClose" title="Close">✕</button>
      </div>
    </header>

    <!-- Main Content Container -->
    <div class="main-body">
      <!-- Navigation Tabs -->
      <nav class="nav-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: currentTab === tab.id }"
          @click="currentTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Tab 1: Node.js OS Module -->
      <section v-if="currentTab === 'os'" class="panel">
        <div class="panel-header">
          <h2>💻 Node.js 'os' Module</h2>
          <button class="btn btn-sm btn-primary" @click="refreshOs">Refresh Metrics</button>
        </div>
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-title">Platform / Arch</span>
            <span class="metric-val">{{ osData.platform }} ({{ osData.arch }})</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">Hostname</span>
            <span class="metric-val">{{ osData.hostname }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">CPU Cores</span>
            <span class="metric-val">{{ osData.cpuCount }} logical cores</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">System Uptime</span>
            <span class="metric-val">{{ osData.uptime }} seconds</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">RAM Usage</span>
            <span class="metric-val">{{ osData.ramUsage }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">User Home Directory</span>
            <span class="metric-val code-val">{{ osData.homedir }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">CPU ID</span>
            <span class="metric-val code-val">{{ osData.cpuid }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">Hard Drive ID</span>
            <span class="metric-val code-val">{{ osData.harddriveId }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">Motherboard ID</span>
            <span class="metric-val code-val">{{ osData.motherboardId }}</span>
          </div>
          <div class="metric-card span-2" style="grid-column: span 2;">
            <span class="metric-title">Unique Machine Fingerprint (SHA-256)</span>
            <span class="metric-val code-val" style="color: #38bdf8; font-size: 11px; word-break: break-all;">{{ osData.fingerprint }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-title">Window Style</span>
            <span class="metric-val" :style="{ color: webUI.isFrameless() ? '#34d399' : '#f59e0b' }">{{ webUI.isFrameless() ? 'Frameless (WebView2)' : 'Standard (Browser)' }}</span>
          </div>
        </div>
      </section>

      <!-- Tab 2: Node.js FS Module -->
      <section v-if="currentTab === 'fs'" class="panel">
        <div class="panel-header">
          <h2>📁 Node.js 'fs' Module</h2>
          <span class="panel-sub">Native Win32 filesystem operations via globalThis.fs</span>
        </div>
        <div class="action-bar">
          <input v-model="fsTestPath" class="input-text" placeholder="File path (e.g. C:\test.txt)" />
          <input v-model="fsTestContent" class="input-text" placeholder="Content to write" />
          <button class="btn btn-accent" @click="testFsWrite">fs.writeFile()</button>
          <button class="btn btn-secondary" @click="testFsRead">fs.readFile()</button>
          <button class="btn btn-secondary" @click="testFsStat">fs.stat()</button>
          <button class="btn btn-secondary" @click="testFsReaddir">fs.readdir()</button>
        </div>
      </section>

      <!-- Tab 3: Shell & Child Process -->
      <section v-if="currentTab === 'shell'" class="panel">
        <div class="panel-header">
          <h2>⚡ Shell & Process Runner</h2>
          <span class="panel-sub">Execute native Windows commands with globalThis.shell.exec()</span>
        </div>
        <div class="action-bar">
          <input v-model="shellCmd" class="input-text flex-1" placeholder="Enter command (e.g. dir, ping 127.0.0.1, whoami)" />
          <button class="btn btn-primary" @click="runShell">Execute Command</button>
          <button class="btn btn-secondary" @click="openExternal">Open Browser (Google)</button>
        </div>
      </section>

      <!-- Tab 4: SQLite Database & Mongoose ODM -->
      <section v-if="currentTab === 'db'" class="panel">
        <div class="panel-header">
          <h2>🗄️ SQLite DB & Mongoose ODM</h2>
          <span class="panel-sub">Real SQLite Embedded Engine (WAL Mode, 64MB Cache, 256MB mmap) + Mongoose ODM</span>
        </div>
        <div class="code-preview">
          <code>
            // 1. High-Speed Direct SQL (POS / ERP / Big Data):<br/>
            await db.run("CREATE TABLE IF NOT EXISTS pos_products (id INTEGER PRIMARY KEY, sku TEXT, name TEXT, price REAL, stock INT)");<br/>
            const products = await db.query("SELECT * FROM pos_products WHERE stock > ? LIMIT 10", [0]);<br/>
            <br/>
            // 2. Mongoose ODM Style (Document Collections):<br/>
            const User = db.model("User", { name: String, role: String });<br/>
            await User.create({ name: "{{ dbNewName }}", role: "admin" });<br/>
            const users = await User.find({ role: "admin" });
          </code>
        </div>
        <div class="action-bar">
          <input v-model="dbNewName" class="input-text" placeholder="User name" />
          <button class="btn btn-primary" @click="testDbCreate">User.create()</button>
          <button class="btn btn-secondary" @click="testDbFind">User.find()</button>
          <button class="btn btn-secondary" @click="testDbCount">User.countDocuments()</button>
        </div>
        <div class="action-bar" style="margin-top: 8px;">
          <input v-model="sqlQueryInput" class="input-text" style="flex: 2;" placeholder="Direct SQL: e.g. SELECT * FROM pos_products" />
          <button class="btn btn-primary" @click="testSqlExecute">db.query()</button>
          <button class="btn btn-secondary" @click="testPosSeed">Seed POS Data</button>
          <button class="btn btn-secondary" @click="testSqlBenchmark">1,000 Trans. Benchmark</button>
        </div>
        <div class="action-bar" style="margin-top: 8px;">
          <input v-model="aiSearchInput" class="input-text" style="flex: 2;" placeholder="AI BM25 / Semantic Search: e.g. admin, alex, scanner" />
          <button class="btn btn-primary" @click="testAiAutoIndex">AI Auto-Index</button>
          <button class="btn btn-secondary" @click="testAiSearch">AI BM25 Search</button>
          <button class="btn btn-secondary" @click="testAiVector">AI Vector Search</button>
          <button class="btn btn-secondary" @click="testAiOptimize">AI Optimize</button>
        </div>
      </section>

      <!-- Tab 5: Node.js Native Modules -->
      <section v-if="currentTab === 'node'" class="panel">
        <div class="panel-header">
          <h2>⚡ Node.js Native Desktop Modules</h2>
          <span class="badge badge-active">Active Native Bridge</span>
        </div>
        <div class="action-bar">
          <button class="btn btn-primary" @click="testNetTcp">net: TCP Echo Test</button>
          <button class="btn btn-secondary" @click="testDgramUdp">dgram: UDP Socket Test</button>
          <button class="btn btn-secondary" @click="testHttpFetch">http: Cesanta Mongoose GET</button>
          <button class="btn btn-primary" @click="testExpress">express: Cesanta Router Test</button>
          <button class="btn btn-primary" @click="testWebSocket">ws: Cesanta WebSocket Test</button>
          <button class="btn btn-secondary" @click="testPath">path: Normalization</button>
          <button class="btn btn-secondary" @click="testAdmZip">adm-zip: ZIP Archive Test</button>
        </div>
        <div class="info-banner">
          <p><strong>🚀 Built-in Node.js Desktop Runtime Modules:</strong></p>
          <ul>
            <li><code>ws</code>: Native WebSocket server & client powered by <strong>Cesanta Mongoose</strong> (<code>new WebSocket.Server()</code>, <code>wss.on('connection')</code>, <code>ws.send()</code>).</li>
            <li><code>express</code>: Complete Express.js application framework backed by <strong>Cesanta Mongoose</strong> HTTP engine (routes, middleware, params, query, JSON).</li>
            <li><code>http</code> & <code>https</code>: Full HTTP/HTTPS multi-client server & client backed by <strong>Cesanta Mongoose</strong> (zero CORS blocks).</li>
            <li><code>net</code>: Native TCP client & server sockets (<code>net.createServer</code>, <code>net.connect</code>, <code>Socket</code>).</li>
            <li><code>dgram</code>: Native UDP datagram sockets (<code>dgram.createSocket</code>, <code>send</code>, <code>bind</code>).</li>
            <li><code>fetch</code>: Full WHATWG fetch wrapper routing through native Mongoose engine.</li>
            <li><code>path</code>: Complete win32 & posix path manipulation.</li>
            <li><code>adm-zip</code>: High-performance ZIP archive creation, inspection, and extraction.</li>
          </ul>
        </div>
      </section>

      <!-- Tab 5: Network & Auto Update -->
      <section v-if="currentTab === 'tools'" class="panel">
        <div class="panel-header">
          <h2>🌐 Network & Auto-Updater</h2>
        </div>
        <div class="action-bar">
          <button class="btn btn-secondary" @click="testNetwork">Check Network & Ping</button>
          <button class="btn btn-secondary" @click="testUpdate">Check GitHub Releases Update</button>
          <button class="btn btn-secondary" @click="testFramelessToggle">Toggle Frameless</button>
        </div>
      </section>

      <!-- Tab 6: System Tray & Desktop Controls -->
      <section v-if="currentTab === 'tray'" class="panel">
        <div class="panel-header">
          <h2>🔔 System Tray & Desktop Controls</h2>
          <span class="badge" :class="trayState.hideToTray ? 'badge-active' : 'badge-inactive'">
            {{ trayState.hideToTray ? 'Hide-To-Tray: ACTIVE' : 'Standard Minimize' }}
          </span>
        </div>
        <div class="action-bar">
          <button class="btn btn-primary" @click="testTrayHide">tray.appHide()</button>
          <button class="btn btn-secondary" @click="testTrayShow">tray.appShow()</button>
          <button class="btn btn-secondary" @click="testTrayToggleHideOnMin">
            {{ trayState.hideToTray ? 'tray.set("app:minimaze", { reset: true })' : 'tray.set("app:minimaze", { hideToTray: true })' }}
          </button>
          <button class="btn btn-primary" @click="testTrayItems">tray.items([...])</button>
          <button class="btn btn-secondary" @click="testTrayTooltip">tray.setTooltip()</button>
        </div>
        <div class="info-banner">
          <p><strong>💡 System Tray & App Minimize API:</strong></p>
          <ul>
            <li><code>tray.set("app:minimaze", { hideToTray: true })</code>: Intercepts minimize button or minimize action to hide window to Windows system tray.</li>
            <li><code>tray.set("app:minimaze", { reset: true })</code>: Restores normal window minimize behavior.</li>
            <li><code>tray.items([ { name, icon, action }, { type: "separator" }, ... ])</code>: Configures right-click tray context menu with interactive JS/Vue callback dispatch.</li>
            <li><code>tray.appHide()</code> / <code>tray.appShow()</code>: Directly programmatically show/hide application.</li>
          </ul>
        </div>
      </section>

      <!-- Shared Live Log Terminal -->
      <footer class="console-box">
        <div class="console-head">
          <span>Terminal Output (Real-time RPC)</span>
          <button class="btn-clear" @click="terminalLogs = []">Clear</button>
        </div>
        <div class="console-body">
          <div v-if="terminalLogs.length === 0" class="muted-text">
            Ready. Click any action above to test native bridge dispatch.
          </div>
          <div v-for="(entry, i) in terminalLogs" :key="i" class="log-line" :class="entry.type">
            <span class="log-time">{{ entry.time }}</span>
            <span class="log-tag">[{{ entry.tag }}]</span>
            <pre class="log-msg">{{ entry.msg }}</pre>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

const appIconSrc = "data:image/x-icon;base64,AAABAAEAICAAAAEAIACoEAAAFgAAACgAAAAgAAAAQAAAAAEAIAAAAAAAgBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPi9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04/wAAAAAAAAAAAAAAAPi9OP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/QSUY/0ElGP9BJRj/+L04/wAAAAAAAAAA+L04/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP9AJBj/QCQY/0AkGP/4vTj/AAAAAAAAAAD4vTj/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX/z8kF/8/JBf/PyQX//i9OP8AAAAA+L04//i9OP8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/+L04//i9OP/4vTj/+L04/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX//////////////////////8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF/8+Ixf/PiMX/z4jF//4vTj/+L04//i9OP/4vTj/PiMX/z4jF/8+Ixf/PiMX/z4jF//4vTj/+L04//i9OP/4vTj/PSIX/z0iF/89Ihf/PSIX/z0iF/89Ihf//////////////////////z0iF/89Ihf/PSIX/z0iF/89Ihf/PSIX/z0iF/89Ihf/+L04//i9OP/4vTj/+L04/z0iF/89Ihf/PSIX/z0iF/89Ihf/PSIX//i9OP/4vTj/+L04//i9OP88Ihb/PCIW/zwiFv88Ihb/PCIW/zwiFv//////////////////////PCIW/zwiFv88Ihb/PCIW/zwiFv88Ihb/PCIW//i9OP/4vTj/+L04//i9OP88Ihb/PCIW/zwiFv88Ihb/PCIW/zwiFv88Ihb/+L04//i9OP/4vTj/+L04/zshFv87IRb/OyEW/zshFv87IRb/OyEW//////////////////////87IRb/OyEW/zshFv87IRb/OyEW/zshFv/4vTj/+L04//i9OP/4vTj/OyEW/zshFv87IRb/OyEW/zshFv87IRb/OyEW/zshFv/4vTj/+L04//i9OP/4vTj/OiEW/zohFv86IRb/OiEW/zohFv86IRb//////////////////////zohFv86IRb/OiEW/zohFv86IRb/OiEW//i9OP/4vTj/+L04//i9OP86IRb/OiEW/zohFv86IRb/OiEW/zohFv86IRb/OiEW//i9OP/4vTj/+L04//i9OP86IBX/OiAV/zogFf86IBX/OiAV/zogFf//////////////////////OiAV/zogFf86IBX/OiAV/zogFf/4vTj/+L04//i9OP/4vTj/OiAV/zogFf86IBX/OiAV/zogFf86IBX/OiAV/zogFf86IBX/+L04//i9OP/4vTj/+L04/zkgFf85IBX/OSAV/zkgFf85IBX/OSAV//////////////////////85IBX/OSAV/zkgFf85IBX/+L04//i9OP/4vTj/+L04/zkgFf85IBX/OSAV/zkgFf85IBX/OSAV/zkgFf85IBX/OSAV/zkgFf/4vTj/+L04//i9OP/4vTj/OB8V/zgfFf84HxX/OB8V/zgfFf84HxX//////////////////////zgfFf84HxX/OB8V//i9OP/4vTj/+L04//i9OP84HxX/OB8V/zgfFf84HxX/OB8V/zgfFf84HxX/OB8V/zgfFf84HxX/OB8V//i9OP/4vTj/+L04//i9OP83HxT/Nx8U/zcfFP83HxT/Nx8U/zcfFP//////////////////////Nx8U/zcfFP/4vTj/+L04//i9OP/4vTj/Nx8U/zcfFP83HxT/Nx8U/zcfFP83HxT/Nx8U/zcfFP83HxT/Nx8U/zcfFP83HxT/+L04//i9OP/4vTj/+L04/zcfFP83HxT/Nx8U/zcfFP83HxT/Nx8U////////////////////////////+L04//i9OP/4vTj/+L04/////////////////zcfFP83HxT/Nx8U/zcfFP83HxT/Nx8U/zcfFP83HxT/Nx8U/zcfFP/4vTj/+L04//i9OP/4vTj/Nh4U/zYeFP82HhT/Nh4U/zYeFP82HhT///////////////////////////////////////////////////////////////////////////82HhT/Nh4U/zYeFP82HhT/Nh4U/zYeFP82HhT/Nh4U//i9OP/4vTj/+L04//i9OP81HhP/NR4T/zUeE/81HhP/NR4T/zUeE/////////////////////////////////////////////////////////////////////////////////81HhP/NR4T/zUeE/81HhP/NR4T/zUeE/81HhP/+L04//i9OP/4vTj/+L04/zQdE/80HRP/NB0T/zQdE/80HRP/NB0T//////////////////////80HRP/NB0T/zQdE/80HRP/NB0T/zQdE/80HRP//////////////////////zQdE/80HRP/NB0T/zQdE/80HRP/NB0T/zQdE//4vTj/+L04//i9OP/4vTj/Mx0T/zMdE/8zHRP/Mx0T/zMdE/8zHRP//////////////////////zMdE/8zHRP/Mx0T/zMdE/8zHRP/Mx0T/zMdE///////////////////////Mx0T/zMdE/8zHRP/Mx0T/zMdE/8zHRP/Mx0T//i9OP/4vTj/+L04//i9OP8zHBL/MxwS/zMcEv8zHBL/MxwS/zMcEv//////////////////////MxwS/zMcEv8zHBL/MxwS/zMcEv8zHBL/MxwS//////////////////////8zHBL/MxwS/zMcEv8zHBL/MxwS/zMcEv8zHBL/+L04//i9OP/4vTj/+L04/zIcEv8yHBL/MhwS/zIcEv8yHBL/MhwS//////////////////////8yHBL/MhwS/zIcEv8yHBL/MhwS/zIcEv8yHBL//////////////////////zIcEv8yHBL/MhwS/zIcEv8yHBL/MhwS/zIcEv/4vTj/+L04//i9OP/4vTj/MRsS/zEbEv8xGxL/MRsS/zEbEv8xGxL//////////////////////zEbEv8xGxL/MRsS/zEbEv8xGxL/MRsS/zEbEv//////////////////////MRsS/zEbEv8xGxL/MRsS/zEbEv8xGxL/MRsS//i9OP/4vTj/+L04//i9OP8wGxL/MBsS/zAbEv8wGxL/MBsS/zAbEv////////////////////////////////////////////////////////////////////////////////8wGxL/MBsS/zAbEv8wGxL/MBsS/zAbEv8wGxL/+L04//i9OP/4vTj/+L04/y8aEf8vGhH/LxoR/y8aEf8vGhH/LxoR////////////////////////////////////////////////////////////////////////////LxoR/y8aEf8vGhH/LxoR/y8aEf8vGhH/LxoR/y8aEf/4vTj/+L04//i9OP/4vTj/LxoR/y8aEf8vGhH/LxoR/y8aEf8vGhH//////////////////////////////////////////////////////////////////////y8aEf8vGhH/LxoR/y8aEf8vGhH/LxoR/y8aEf8vGhH/LxoR//i9OP/4vTj/+L04//i9OP8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/LhkR/y4ZEf8uGRH/+L04//i9OP8AAAAA+L04/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP8tGRD/LRkQ/y0ZEP/4vTj/AAAAAAAAAAD4vTj/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ//i9OP8AAAAAAAAAAPi9OP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/LBgQ/ywYEP8sGBD/+L04/wAAAAAAAAAAAAAAAPi9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04//i9OP/4vTj/+L04/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAAMMAAACBAAAAgQAAAIEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgQAAAIEAAACBAAAAwwAAAP8=";

const allTabs = [
  { id: "os", label: "OS Metrics", check: () => isModuleEnabled("os") },
  { id: "fs", label: "File System", check: () => isModuleEnabled("fs") },
  { id: "shell", label: "Shell & Process", check: () => isModuleEnabled("shell") || isModuleEnabled("process") },
  { id: "db", label: "SQLite DB & Mongoose", check: () => isModuleEnabled("database") },
  { id: "node", label: "Node.js Modules", check: () => isModuleEnabled("net") || isModuleEnabled("dgram") || isModuleEnabled("http") || isModuleEnabled("admZip") || isModuleEnabled("ws") },
  { id: "tools", label: "Network & Update", check: () => isModuleEnabled("network") || isModuleEnabled("update") || isModuleEnabled("cloudSync") },
  { id: "tray", label: "System Tray", check: () => isModuleEnabled("tray") },
];

const tabs = computed(() => {
  const filtered = allTabs.filter((t) => t.check());
  return filtered.length > 0 ? filtered : allTabs;
});

const currentTab = ref(tabs.value[0]?.id || "db");

const terminalLogs = ref<Array<{ time: string; tag: string; msg: string; type: string }>>([]);

function printLog(tag: string, msg: string, type: "info" | "success" | "warn" | "error" = "info") {
  const time = new Date().toLocaleTimeString();
  terminalLogs.value.unshift({ time, tag, msg, type });
}

// OS Data State
const osData = ref({
  platform: "...",
  arch: "...",
  hostname: "...",
  cpuCount: 0,
  uptime: 0,
  ramUsage: "...",
  homedir: "...",
  cpuid: "...",
  harddriveId: "...",
  motherboardId: "...",
  fingerprint: "...",
});

async function refreshOs() {
  try {
    const info = await os.getInfo(true);
    const usedGb = (((info.totalmem || 0) - (info.freemem || 0)) / 1024 / 1024 / 1024).toFixed(1);
    const totalGb = ((info.totalmem || 0) / 1024 / 1024 / 1024).toFixed(1);

    osData.value = {
      platform: info.platform || "win32",
      arch: info.arch || "x64",
      hostname: info.hostname || "localhost",
      cpuCount: info.cpuCount || 4,
      uptime: info.uptime || 0,
      ramUsage: `${usedGb} GB / ${totalGb} GB`,
      homedir: info.homedir || "C:\\Users",
      cpuid: info.cpuid || "...",
      harddriveId: info.harddriveId || "...",
      motherboardId: info.motherboardId || "...",
      fingerprint: info.fingerprint || "...",
    };
    printLog("OS", `Fetched OS metrics & hardware fingerprint: ${(info.fingerprint || "").substring(0, 16)}...`, "success");
  } catch (err: any) {
    printLog("ERR", err.message, "error");
  }
}

// Frameless Window Dragging & Controls
const isMaximized = ref(false);

function handleTitlebarMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target && target.closest(".titlebar-controls, .win-btn")) {
    return;
  }
  if (e.button === 0) { // Primary left click
    webUI.dragWindow();
  }
}

async function handleMinimize() {
  await webUI.minimize();
}

async function handleMaximize() {
  if (isMaximized.value) {
    await webUI.restore();
  } else {
    await webUI.maximize();
  }
  try {
    isMaximized.value = await webUI.isMaximized();
  } catch {}
}

async function handleClose() {
  try {
    if (typeof (window as any).close_win === "function") {
      (window as any).close_win();
    }
  } catch (_) {}
  try {
    await webUI.close();
  } catch (_) {}
}

// FS Test State
const fsTestPath = ref("C:\\Users\\Admin\\Desktop\\Projects\\RitaWapp\\ritawapp_demo.txt");
const fsTestContent = ref("RitaWapp Node.js-style FS Test Content");

async function testFsWrite() {
  try {
    printLog("FS", `Writing to: ${fsTestPath.value}`, "info");
    await fs.writeFile(fsTestPath.value, fsTestContent.value);
    printLog("FS", `Successfully wrote file: ${fsTestPath.value}`, "success");
  } catch (err: any) {
    printLog("FS_ERR", err.message, "error");
  }
}

async function testFsRead() {
  try {
    const data = await fs.readFile(fsTestPath.value);
    printLog("FS", `Read content: "${data}"`, "success");
  } catch (err: any) {
    printLog("FS_ERR", err.message, "error");
  }
}

async function testFsStat() {
  try {
    const stat = await fs.stat(fsTestPath.value);
    printLog("FS", JSON.stringify(stat, null, 2), "success");
  } catch (err: any) {
    printLog("FS_ERR", err.message, "error");
  }
}

async function testFsReaddir() {
  try {
    const appDir = await fs.getAppDir();
    const files = await fs.readdir(appDir);
    printLog("FS", `Files in ${appDir}:\n${JSON.stringify(files, null, 2)}`, "success");
  } catch (err: any) {
    printLog("FS_ERR", err.message, "error");
  }
}

// Shell State
const shellCmd = ref("whoami");
async function runShell() {
  try {
    printLog("SHELL", `Executing: ${shellCmd.value}`, "info");
    const res = await shell.exec(shellCmd.value);
    const stdoutStr = (res && typeof res.stdout === "string") ? res.stdout.trim() : (typeof res === "string" ? res : JSON.stringify(res));
    const exitCode = typeof res?.exitCode === "number" ? res.exitCode : 0;
    printLog("SHELL", `Exit code ${exitCode}:\n${stdoutStr}`, exitCode === 0 ? "success" : "warn");
  } catch (err: any) {
    printLog("SHELL_ERR", err.message, "error");
  }
}

function openExternal() {
  shell.openExternal("https://www.google.com");
  printLog("SHELL", "Triggered ShellExecute for https://www.google.com", "info");
}

// DB State
const dbNewName = ref("Alex Mercer");
const UserModel = db.model("User", { name: String, role: String });

async function testDbCreate() {
  try {
    const doc = await UserModel.create({ name: dbNewName.value, role: "admin" });
    printLog("DB", `User.create() result: ${JSON.stringify(doc)}`, "success");
  } catch (err: any) {
    printLog("DB_ERR", err.message, "error");
  }
}

async function testDbFind() {
  try {
    const users = await UserModel.find({ role: "admin" });
    printLog("DB", `User.find() result:\n${JSON.stringify(users, null, 2)}`, "success");
  } catch (err: any) {
    printLog("DB_ERR", err.message, "error");
  }
}

async function testDbCount() {
  try {
    const count = await UserModel.countDocuments();
    printLog("DB", `User.countDocuments(): ${count}`, "success");
  } catch (err: any) {
    printLog("DB_ERR", err.message, "error");
  }
}

// POS & Direct SQLite State & Methods
const sqlQueryInput = ref("SELECT * FROM pos_products ORDER BY id DESC LIMIT 5");

async function testSqlExecute() {
  try {
    printLog("SQL", `Executing: ${sqlQueryInput.value}`, "info");
    const rows = await db.query(sqlQueryInput.value);
    printLog("SQL", `Query returned ${rows.length} rows:\n${JSON.stringify(rows, null, 2)}`, "success");
  } catch (err: any) {
    printLog("SQL_ERR", err.message, "error");
  }
}

async function testPosSeed() {
  try {
    printLog("SQL_POS", "Initializing POS schema (pos_products table)...", "info");
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pos_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE,
        name TEXT,
        price REAL,
        stock INTEGER,
        category TEXT
      );
    `);

    // Insert sample POS inventory
    const sampleItems = [
      ["BARCODE-001", "Wireless Barcode Scanner", 49.99, 120, "Hardware"],
      ["BARCODE-002", "Thermal Receipt Printer 80mm", 89.50, 45, "Hardware"],
      ["BARCODE-003", "Electronic Cash Drawer RJ11", 65.00, 30, "Hardware"],
      ["BARCODE-004", "POS Touchscreen Terminal 15.6\"", 399.00, 15, "Systems"],
    ];

    for (const [sku, name, price, stock, category] of sampleItems) {
      await db.run(
        "INSERT OR REPLACE INTO pos_products (sku, name, price, stock, category) VALUES (?, ?, ?, ?, ?)",
        [sku, name, price, stock, category]
      );
    }

    const countRow = await db.get("SELECT COUNT(*) as total FROM pos_products");
    printLog("SQL_POS", `POS database seeded! Total products in catalog: ${countRow?.total ?? 4}`, "success");
  } catch (err: any) {
    printLog("SQL_POS_ERR", err.message, "error");
  }
}

async function testSqlBenchmark() {
  try {
    printLog("BENCH", "Starting 1,000 rapid POS transactions benchmark (WAL mode)...", "info");
    const t0 = performance.now();
    await db.run("CREATE TABLE IF NOT EXISTS pos_sales (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT, total REAL, created_at TEXT)");

    const queries: Array<{ sql: string; params: any[] }> = [];
    for (let i = 1; i <= 1000; i++) {
      queries.push({
        sql: "INSERT INTO pos_sales (receipt_no, total, created_at) VALUES (?, ?, ?)",
        params: [`REC-${100000 + i}`, Number((Math.random() * 150 + 5).toFixed(2)), new Date().toISOString()],
      });
    }

    await db.transaction(queries);
    const duration = (performance.now() - t0).toFixed(1);
    const totalCount = await db.get("SELECT COUNT(*) as total FROM pos_sales");
    printLog("BENCH", `1,000 transactions committed in ${duration}ms! Total sales records: ${totalCount?.total}`, "success");
  } catch (err: any) {
    printLog("BENCH_ERR", err.message, "error");
  }
}

// AI Database Auto-Indexing & Vector Search
const aiSearchInput = ref("admin");

async function testAiAutoIndex() {
  try {
    printLog("AI_INDEX", "Running solid AI auto-indexing on 'User' collection...", "info");
    const t0 = performance.now();
    const res = await db.ai.autoIndex("User");
    const elapsed = (performance.now() - t0).toFixed(1);
    printLog("AI_INDEX", `Auto-indexing complete in ${elapsed}ms: ${JSON.stringify(res)}`, "success");
  } catch (err: any) {
    printLog("AI_INDEX_ERR", err.message, "error");
  }
}

async function testAiSearch() {
  try {
    printLog("AI_SEARCH", `Running FTS5 BM25 search for '${aiSearchInput.value}'...`, "info");
    const t0 = performance.now();
    const res = await db.ai.search("User", aiSearchInput.value, 10);
    const elapsed = (performance.now() - t0).toFixed(1);
    printLog("AI_SEARCH", `BM25 Search found ${res.total} matches in ${elapsed}ms:\n${JSON.stringify(res.data, null, 2)}`, "success");
  } catch (err: any) {
    printLog("AI_SEARCH_ERR", err.message, "error");
  }
}

async function testAiVector() {
  try {
    printLog("AI_VEC", "Storing & searching vector embeddings (128-dim simulation)...", "info");
    const dim = 128;
    // Generate synthetic normalized embedding vectors
    const vecA = Array.from({ length: dim }, (_, i) => Math.sin(i * 0.1));
    const vecB = Array.from({ length: dim }, (_, i) => Math.sin(i * 0.1 + 0.05)); // High similarity
    const vecC = Array.from({ length: dim }, (_, i) => Math.cos(i * 0.5));        // Low similarity

    await db.ai.storeVector("User", "user_alex", vecA, { name: "Alex Mercer", role: "admin" });
    await db.ai.storeVector("User", "user_sarah", vecB, { name: "Sarah Connor", role: "moderator" });
    await db.ai.storeVector("User", "user_guest", vecC, { name: "Guest User", role: "visitor" });

    const t0 = performance.now();
    const searchRes = await db.ai.searchVector("User", vecA, 3);
    const elapsed = (performance.now() - t0).toFixed(2);
    printLog("AI_VEC", `Vector similarity search completed in ${elapsed}ms:\n${JSON.stringify(searchRes.matches, null, 2)}`, "success");
  } catch (err: any) {
    printLog("AI_VEC_ERR", err.message, "error");
  }
}

async function testAiOptimize() {
  try {
    const res = await db.ai.optimize();
    printLog("AI_OPT", `Database query planner and WAL optimized: ${res.message}`, "success");
  } catch (err: any) {
    printLog("AI_OPT_ERR", err.message, "error");
  }
}

// Tools
async function testNetwork() {
  try {
    const online = await network.isOnline();
    const ping = await network.ping("8.8.8.8");
    printLog("NET", `Online: ${online}, Ping to 8.8.8.8: ${ping.latencyMs}ms (OK: ${ping.ok})`, "success");
  } catch (err: any) {
    printLog("NET_ERR", err.message, "error");
  }
}

async function testUpdate() {
  try {
    const repo = await update.getRepoUrl();
    printLog("UPDATE", `Checking GitHub Releases via repoUrl: ${repo || '(default)'}...`, "info");
    const res = await update.checkForUpdates();
    printLog("UPDATE", `Latest: v${res.latestVersion} (Has update: ${res.hasUpdate}) - Repo: ${res.repoUrl || repo}`, res.hasUpdate ? "warn" : "success");
    if (res.releaseNotes) {
      printLog("NOTES", res.releaseNotes.substring(0, 100) + "...", "info");
    }
  } catch (err: any) {
    printLog("UPDATE_ERR", err.message, "error");
  }
}

let isFramelessState = true;
async function testFramelessToggle() {
  isFramelessState = !isFramelessState;
  await webUI.setFrameless(isFramelessState);
  printLog("WIN", `setFrameless(${isFramelessState}) applied!`, "success");
}

// System Tray Actions & State
const trayState = ref({
  hideToTray: false,
});

async function testTrayHide() {
  await tray.appHide();
  printLog("TRAY", "tray.appHide() executed: Window hidden to notification tray.", "info");
}

async function testTrayShow() {
  await tray.appShow();
  printLog("TRAY", "tray.appShow() executed: Window restored to desktop.", "success");
}

async function testTrayToggleHideOnMin() {
  const next = !trayState.value.hideToTray;
  if (next) {
    await tray.set("app:minimaze", { hideToTray: true });
    trayState.value.hideToTray = true;
    printLog("TRAY", 'tray.set("app:minimaze", { hideToTray: true }) applied! Minimize now hides to tray.', "success");
  } else {
    await tray.set("app:minimaze", { reset: true });
    trayState.value.hideToTray = false;
    printLog("TRAY", 'tray.set("app:minimaze", { reset: true }) applied! Standard minimize restored.', "info");
  }
}

async function testTrayItems() {
  await tray.items([
    {
      name: "🚀 Restore RitaWapp",
      action: () => {
        tray.appShow();
        printLog("TRAY", "Menu Action executed: Restore RitaWapp", "success");
      },
    },
    { type: "separator" },
    {
      name: "⚡ Run Diagnostic Test",
      action: () => {
        printLog("TRAY", "Menu Action executed: Diagnostic Test Passed (OK)", "info");
      },
    },
    {
      name: "Toggle Minimize-to-Tray Mode",
      action: () => {
        testTrayToggleHideOnMin();
      },
    },
    { name: "-" },
    {
      name: "✕ Exit Application",
      action: "exit",
    },
  ]);
  printLog("TRAY", "tray.items() registered custom context menu with 5 items and separators.", "success");
}

async function testTrayTooltip() {
  await tray.setTooltip("RitaWapp - Active Desktop Runtime");
  printLog("TRAY", "tray.setTooltip('RitaWapp - Active Desktop Runtime') applied.", "info");
}

// ============================================================================
// Node.js Native Desktop Modules Test Functions
// ============================================================================

async function testNetTcp() {
  try {
    printLog("NET_TCP", "Starting local TCP echo server on port 19876...", "info");
    const server = net.createServer((socket) => {
      printLog("NET_TCP", `Server: Inbound client connected from ${socket.remoteAddress || '127.0.0.1'}:${socket.remotePort || 0}`, "info");
      socket.on("data", (data) => {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        printLog("NET_TCP", `Server: Received "${text}" -> echoing back`, "success");
        socket.write(`ECHO: ${text}`);
      });
    });

    server.listen(19876, "127.0.0.1", () => {
      const boundPort = server.address().port || 19876;
      printLog("NET_TCP", `Server listening on 127.0.0.1:${boundPort}. Connecting client socket...`, "info");
      
      const client = net.connect({ port: boundPort, host: "127.0.0.1" }, () => {
        printLog("NET_TCP", "Client: Connected to echo server! Sending handshake...", "info");
        client.write("Hello from RitaWapp TCP Socket!");
      });

      client.on("data", (data) => {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        printLog("NET_TCP", `Client: Received reply from server: "${text}"`, "success");
        client.end();
        server.close();
        printLog("NET_TCP", "Client and server gracefully closed. TCP test passed!", "success");
      });

      client.on("error", (err: any) => {
        printLog("NET_TCP_ERR", `Client error: ${err?.message || err}`, "error");
        server.close();
      });
    });

    server.on("error", (err: any) => {
      printLog("NET_TCP_ERR", `Server error: ${err?.message || err}`, "error");
    });
  } catch (err: any) {
    printLog("NET_TCP_ERR", err?.message || String(err), "error");
  }
}

async function testDgramUdp() {
  try {
    printLog("DGRAM_UDP", "Creating UDP4 socket on port 19877...", "info");
    const socket = dgram.createSocket("udp4");

    socket.on("message", (msg, rinfo) => {
      const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);
      printLog("DGRAM_UDP", `Received UDP packet from ${rinfo.address}:${rinfo.port}: "${text}"`, "success");
      socket.close(() => {
        printLog("DGRAM_UDP", "UDP socket closed. Datagram test passed!", "success");
      });
    });

    socket.bind(19877, "127.0.0.1", () => {
      const boundPort = socket.address().port || 19877;
      printLog("DGRAM_UDP", `Socket bound to 127.0.0.1:${boundPort}. Sending datagram packet...`, "info");
      socket.send("RitaWapp UDP Datagram Payload", boundPort, "127.0.0.1", (err, bytes) => {
        if (err) {
          printLog("DGRAM_UDP_ERR", `Send error: ${err?.message || err}`, "error");
        } else {
          printLog("DGRAM_UDP", `Sent ${bytes} bytes via UDP datagram.`, "info");
        }
      });
    });

    socket.on("error", (err: any) => {
      printLog("DGRAM_UDP_ERR", `Socket error: ${err?.message || err}`, "error");
    });
  } catch (err: any) {
    printLog("DGRAM_UDP_ERR", err?.message || String(err), "error");
  }
}

async function testHttpFetch() {
  try {
    printLog("HTTP_FETCH", "Dispatching native desktopFetch() with CORS bypass...", "info");
    const res = await desktopFetch("https://httpbin.org/get", {
      headers: { "User-Agent": "RitaWapp-Desktop-Runtime/1.0" },
    });
    printLog("HTTP_FETCH", `desktopFetch status: ${res.status} ${res.statusText || 'OK'}`, res.ok ? "success" : "warn");
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { body: text }; }
    printLog("HTTP_FETCH", `Response status: ${res.status}\nHost Origin: ${data.origin || '200 OK'}`, "success");

    printLog("HTTP_GET", "Testing http.get() native wrapper...", "info");
    http.get("http://httpbin.org/ip", (resp) => {
      let body = "";
      resp.on("data", (chunk: string) => { body += chunk; });
      resp.on("end", () => {
        printLog("HTTP_GET", `http.get() completed with status ${resp.statusCode}: ${body.trim()}`, "success");
      });
    }).on("error", (err: any) => {
      printLog("HTTP_GET_ERR", err?.message || String(err), "error");
    });
  } catch (err: any) {
    printLog("HTTP_FETCH_ERR", err?.message || String(err), "error");
  }
}

async function testExpress() {
  try {
    printLog("EXPRESS", "Initializing embedded Express.js application...", "info");
    const app = express();

    app.use((req: any, _res: any, next: any) => {
      printLog("EXPRESS", `[Middleware] ${req.method} ${req.url}`, "info");
      next();
    });

    app.get("/api/status", (_req: any, res: any) => {
      res.json({
        framework: "RitaWapp",
        runtime: "Ultra-Lightweight C/WebUI",
        status: "operational",
        uptimeSeconds: Math.floor(performance.now() / 1000),
      });
    });

    app.get("/api/hello/:name", (req: any, res: any) => {
      res.send(`Hello, ${req.params.name}! Welcome to RitaWapp Express.`);
    });

    const server = app.listen(19878, "127.0.0.1", async () => {
      const actualPort = server.port || 19878;
      printLog("EXPRESS", `Express server listening on http://127.0.0.1:${actualPort}`, "info");

      try {
        const respStatus = await desktopFetch(`http://127.0.0.1:${actualPort}/api/status`);
        const json = await respStatus.json();
        printLog("EXPRESS", `GET /api/status response:\n${JSON.stringify(json, null, 2)}`, "success");

        const respHello = await desktopFetch(`http://127.0.0.1:${actualPort}/api/hello/Developer`);
        const text = await respHello.text();
        printLog("EXPRESS", `GET /api/hello/Developer response: "${text}"`, "success");
      } catch (e: any) {
        printLog("EXPRESS_ERR", `Client request failed: ${e.message}`, "error");
      } finally {
        server.close(() => {
          printLog("EXPRESS", "Express server gracefully stopped. Express test passed!", "success");
        });
      }
    });
  } catch (err: any) {
    printLog("EXPRESS_ERR", err.message, "error");
  }
}

async function testWebSocket() {
  try {
    printLog("WS", "Starting native WebSocket server on ws://127.0.0.1:19879 (Cesanta Mongoose)...", "info");
    const wss = new ws.Server({ port: 19879 });

    wss.on("connection", (clientSocket: any) => {
      printLog("WS_SRV", `Client connected to WebSocket server (connId: ${clientSocket.connId})`, "info");
      clientSocket.on("message", (msg: string) => {
        printLog("WS_SRV", `Server received WebSocket frame: "${msg}" -> Echoing back!`, "success");
        clientSocket.send(`WS_ECHO: ${msg}`);
      });
    });

    // Connect WebSocket client to our server
    const client = new WebSocket("ws://127.0.0.1:19879");
    client.onopen = () => {
      printLog("WS_CLI", "Client connected! Sending handshake packet...", "info");
      client.send("Hello from RitaWapp WebSocket Client via Cesanta Mongoose!");
    };

    client.onmessage = (evt: any) => {
      printLog("WS_CLI", `Client received frame from server: "${evt.data}"`, "success");
      client.close();
      wss.close();
      printLog("WS", "WebSocket client & server gracefully closed. WebSocket test passed!", "success");
    };

    client.onerror = (err: any) => {
      printLog("WS_ERR", `WebSocket client error: ${err}`, "error");
      wss.close();
    };
  } catch (err: any) {
    printLog("WS_ERR", err.message, "error");
  }
}

async function testPath() {
  try {
    printLog("PATH", "Testing Node.js 'path' module (win32 & posix)...", "info");
    const joined = path.win32.join("C:\\RitaWapp", "src", "runtime", "index.ts");
    const normalized = path.win32.normalize("C:\\RitaWapp\\..\\Projects\\RitaWapp\\./src");
    const parsed = path.win32.parse(joined);
    const posixJoined = path.posix.join("/usr", "local", "bin", "ritawapp");
    
    printLog("PATH", `path.win32.join(): ${joined}`, "success");
    printLog("PATH", `path.win32.normalize(): ${normalized}`, "info");
    printLog("PATH", `path.win32.parse():\n${JSON.stringify(parsed, null, 2)}`, "success");
    printLog("PATH", `path.posix.join(): ${posixJoined}`, "info");
  } catch (err: any) {
    printLog("PATH_ERR", err.message, "error");
  }
}

async function testAdmZip() {
  try {
    printLog("ADM_ZIP", "Testing Node.js 'adm-zip' module in-memory & file capabilities...", "info");
    const zip = new AdmZip();
    
    zip.addFile("manifest.json", JSON.stringify({
      name: "RitaWapp Desktop App",
      version: "1.0.0",
      runtime: "WebUI Native C",
      sizeMb: "< 2MB",
      modules: ["net", "dgram", "http", "https", "express", "fetch", "adm-zip", "path", "database"]
    }, null, 2));

    zip.addFile("readme.txt", "High-performance ultra-tiny desktop runtime without Node.js/Electron bloat.");
    
    const entries = zip.getEntries();
    printLog("ADM_ZIP", `Created in-memory ZIP with ${entries.length} entries:\n` + 
      entries.map((e: any) => ` - ${e.entryName} (${e.header.size} bytes)`).join("\n"), "success");

    const text = zip.readAsText("readme.txt");
    printLog("ADM_ZIP", `readAsText("readme.txt"): "${text}"`, "success");
  } catch (err: any) {
    printLog("ADM_ZIP_ERR", err.message, "error");
  }
}

onMounted(async () => {
  printLog("MODE", isAssetsMod ? "assetsMod: true (external assets in ./dist/bin/data/assets, /data/Rita.W.app, /data/database.db)" : "assetsMod: false (normal single-bundle mode)", "info");
  if (isModuleEnabled("os")) {
    refreshOs();
  }
  printLog("RITA", "RitaWapp Vue 3 plugin initialized with selective module injection.", "success");
  if (isModuleEnabled("appWindow")) {
    try {
      isMaximized.value = await webUI.isMaximized();
    } catch {}
  }
  if (isModuleEnabled("tray")) {
    try {
      trayState.value.hideToTray = await tray.isHideToTray();
    } catch {}
  }
  window.addEventListener("resize", async () => {
    if (isModuleEnabled("appWindow")) {
      try {
        isMaximized.value = await webUI.isMaximized();
      } catch {}
    }
  });
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
}

html, body {
  background: transparent !important;
  color: #f1f5f9;
  overflow: hidden;
}

.app-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(13, 18, 31, 0.90);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
}

/* Frameless Title Bar */
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  background: #090d16;
  border-bottom: 1px solid #1e293b;
  padding: 0 8px 0 14px;
  cursor: default;
  -webkit-app-region: drag;
  user-select: none;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  -webkit-app-region: drag;
}

.app-icon {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: contain;
  display: block;
}

.app-title {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}

.tag {
  font-size: 10px;
  background: #3b82f622;
  color: #60a5fa;
  border: 1px solid #3b82f644;
  padding: 2px 6px;
  border-radius: 9999px;
  margin-left: 6px;
  font-weight: 500;
}

.titlebar-center {
  color: #475569;
  font-size: 11px;
  -webkit-app-region: drag;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 32px;
  height: 26px;
  border: none;
  background: transparent;
  color: #94a3b8;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  -webkit-app-region: no-drag;
}

.win-btn:hover {
  background: #1e293b;
  color: white;
}

.win-close:hover {
  background: #ef4444;
  color: white;
}

/* Body & Navigation */
.main-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 14px;
  min-height: 0;
}

.nav-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 10px;
}

.tab-btn {
  background: transparent;
  border: 1px solid #1e293b;
  color: #94a3b8;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  background: #131b2e;
  color: #e2e8f0;
}

.tab-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

/* Panel Layouts */
.panel {
  background: #131b2e;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 700;
  color: #cbd5e1;
}

.panel-sub {
  font-size: 11px;
  color: #64748b;
}

.badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
}

.badge-active {
  background: #10b98122;
  color: #34d399;
  border: 1px solid #10b98144;
}

.badge-inactive {
  background: #64748b22;
  color: #94a3b8;
  border: 1px solid #64748b44;
}

.info-banner {
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-banner p {
  color: #cbd5e1;
  font-size: 12px;
}

.info-banner ul {
  list-style-type: disc;
  margin-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-banner li {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
}

.info-banner code {
  color: #38bdf8;
  background: #0f172a;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.metric-card {
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-title {
  font-size: 10px;
  color: #64748b;
  text-transform: uppercase;
}

.metric-val {
  font-size: 14px;
  font-weight: 700;
  color: #38bdf8;
}

.code-val {
  font-family: monospace;
  font-size: 11px;
  word-break: break-all;
}

.action-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.input-text {
  background: #090d16;
  border: 1px solid #1e293b;
  color: #f1f5f9;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
}

.input-text:focus {
  border-color: #3b82f6;
}

.flex-1 {
  flex: 1;
}

.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 11px;
}

.btn-primary { background: #3b82f6; color: white; }
.btn-primary:hover { background: #2563eb; }

.btn-secondary { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; }
.btn-secondary:hover { background: #334155; }

.btn-accent { background: #42b883; color: #0b0f19; font-weight: 700; }
.btn-accent:hover { background: #34a26e; }

.code-preview {
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 10px;
  font-family: monospace;
  font-size: 11px;
  color: #94a3b8;
}

/* Console Box */
.console-box {
  flex: 1;
  background: #060911;
  border: 1px solid #1e293b;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.console-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #0a0f1d;
  border-bottom: 1px solid #1e293b;
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

.btn-clear {
  background: transparent;
  border: 1px solid #1e293b;
  color: #64748b;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-clear:hover { color: #cbd5e1; }

.console-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  font-family: "Cascadia Code", "Fira Code", monospace;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.muted-text {
  color: #475569;
  font-style: italic;
  margin: auto;
}

.log-line {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 4px 6px;
  border-radius: 4px;
  background: #0b0f19aa;
}

.log-line.info { border-left: 2px solid #38bdf8; }
.log-line.success { border-left: 2px solid #10b981; }
.log-line.warn { border-left: 2px solid #f59e0b; }
.log-line.error { border-left: 2px solid #ef4444; }

.log-time { color: #475569; font-size: 10px; }
.log-tag { color: #94a3b8; font-weight: 700; }
.log-msg { color: #e2e8f0; white-space: pre-wrap; word-break: break-all; margin: 0; }
</style>
