import test from 'node:test';
import assert from 'node:assert/strict';
import { REMOTE_STALE_MS, selectedMicSource } from '../mic-source.js';

test('Mac como único microfone é fonte de pontuação', () => {
  assert.equal(selectedMicSource({localEnabled:true,now:10000}), 'mac');
});

test('Conectar celular não desativa Mac até receber medições', () => {
  assert.equal(selectedMicSource({remoteConnected:true,remoteLastAt:0,localEnabled:true,now:10000}), 'mac');
});

test('Celular ativo ganha prioridade, sem duplicar amostras', () => {
  assert.equal(selectedMicSource({remoteConnected:true,remoteLastAt:9800,localEnabled:true,now:10000}), 'phone');
});

test('Falta de amostras remotas provoca retorno automático ao Mac', () => {
  assert.equal(selectedMicSource({remoteConnected:true,remoteLastAt:5000,localEnabled:true,now:5000 + REMOTE_STALE_MS + 1}), 'mac');
});

test('Desconexão do celular retorna imediatamente ao Mac', () => {
  assert.equal(selectedMicSource({remoteConnected:false,remoteLastAt:9999,localEnabled:true,now:10000}), 'mac');
});

test('Sem microfone ativo, não há fonte de pontuação', () => {
  assert.equal(selectedMicSource({remoteConnected:true,remoteLastAt:0,localEnabled:false,now:10000}), 'none');
  assert.equal(selectedMicSource({remoteConnected:false,remoteLastAt:0,localEnabled:false,now:10000}), 'none');
});

test('Celular ativo pode pontuar sem ativar microfone do Mac', () => {
  assert.equal(selectedMicSource({remoteConnected:true,remoteLastAt:9900,localEnabled:false,now:10000}), 'phone');
});
