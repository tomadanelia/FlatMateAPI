import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AlgorithmKey, UserRole } from '../../generated/prisma/client';
import { AdminService } from './admin.service';
import { UpdateAlgorithmDto } from './dto/update-algorithm.dto';
import { UpdateQuestionDto, UploadQuestionsDto } from './dto/question.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

const adminHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Flatmate algorithms</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px;background:#f6f7fb;color:#202431}h1{margin-bottom:4px}.card{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;background:white;padding:18px;margin:12px 0;border-radius:12px;box-shadow:0 2px 12px #0001}input{padding:8px}button{padding:10px 16px;background:#635bff;color:white;border:0;border-radius:8px}.muted{color:#667}</style></head><body><h1>Matching algorithms</h1><p class="muted">Enable strategies and tune their relative weights.</p><p><input id="token" type="password" placeholder="Admin JWT"> <button onclick="load()">Load</button></p><main id="app"></main><script>const api='/api/admin/algorithms';const headers=()=>({'Authorization':'Bearer '+document.querySelector('#token').value});async function load(){const r=await fetch(api,{headers:headers()});if(!r.ok)return alert('Access denied');const rows=await r.json();document.querySelector('#app').innerHTML=rows.map(x=>\`<div class="card"><strong>\${x.key}</strong><label><input id="e-\${x.key}" type="checkbox" \${x.enabled?'checked':''}> enabled</label><label>weight <input id="w-\${x.key}" type="number" min="0" step=".1" value="\${x.weight}" style="width:65px"></label><button onclick="save('\${x.key}')">Save</button></div>\`).join('')}async function save(k){const body={enabled:document.querySelector('#e-'+k).checked,weight:Number(document.querySelector('#w-'+k).value)};const r=await fetch(api+'/'+k,{method:'PATCH',headers:{...headers(),'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)return alert('Save failed');alert(k+' saved')}</script></body></html>`;

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  page() {
    return adminHtml;
  }

  @Get('algorithms')
  list() {
    return this.admin.list();
  }

  @Patch('algorithms/:key')
  update(@Param('key') key: AlgorithmKey, @Body() dto: UpdateAlgorithmDto) {
    return this.admin.update(key, dto);
  }

  @Post('tests/:testDefinitionId/questions')
  uploadQuestions(
    @Param('testDefinitionId') testDefinitionId: string,
    @Body() dto: UploadQuestionsDto,
  ) {
    return this.admin.uploadQuestions(testDefinitionId, dto);
  }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.admin.updateQuestion(id, dto);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.admin.updateUserRole(id, dto.role);
  }

  @Delete('messages')
  clearMessages() {
    return this.admin.clearMessages();
  }
}
