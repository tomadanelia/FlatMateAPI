import { Body, Controller, Get, Header, Param, Patch, UseGuards } from '@nestjs/common';
import { AlgorithmKey } from '@prisma/client';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { AdminService } from './admin.service';
import { UpdateAlgorithmDto } from './dto/update-algorithm.dto';

const adminHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Flatmate algorithms</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px;background:#f6f7fb;color:#202431}h1{margin-bottom:4px}.card{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;background:white;padding:18px;margin:12px 0;border-radius:12px;box-shadow:0 2px 12px #0001}input{padding:8px}button{padding:10px 16px;background:#635bff;color:white;border:0;border-radius:8px}.muted{color:#667}</style></head><body><h1>Matching algorithms</h1><p class="muted">Enable strategies and tune their relative weights.</p><p><input id="key" type="password" placeholder="Admin API key"> <button onclick="load()">Load</button></p><main id="app"></main><script>const api='/api/admin/algorithms';async function load(){const key=document.querySelector('#key').value;const r=await fetch(api,{headers:{'x-admin-key':key}});if(!r.ok)return alert('Access denied');const rows=await r.json();document.querySelector('#app').innerHTML=rows.map(x=>\`<div class="card"><strong>\${x.key}</strong><label><input id="e-\${x.key}" type="checkbox" \${x.enabled?'checked':''}> enabled</label><label>weight <input id="w-\${x.key}" type="number" min="0" step=".1" value="\${x.weight}" style="width:65px"></label><button onclick="save('\${x.key}')">Save</button></div>\`).join('')}async function save(k){const key=document.querySelector('#key').value;const body={enabled:document.querySelector('#e-'+k).checked,weight:Number(document.querySelector('#w-'+k).value)};const r=await fetch(api+'/'+k,{method:'PATCH',headers:{'content-type':'application/json','x-admin-key':key},body:JSON.stringify(body)});if(!r.ok)return alert('Save failed');alert(k+' saved')}}</script></body></html>`;

@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get('admin') @Header('content-type', 'text/html; charset=utf-8') page() { return adminHtml; }
  @Get('admin/algorithms') @UseGuards(AdminApiKeyGuard) list() { return this.admin.list(); }
  @Patch('admin/algorithms/:key') @UseGuards(AdminApiKeyGuard) update(@Param('key') key: AlgorithmKey, @Body() dto: UpdateAlgorithmDto) { return this.admin.update(key, dto); }
}
