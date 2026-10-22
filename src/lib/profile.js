import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const BUCKET = 'course-covers';
const isDemoUser = (id) => String(id || '').startsWith('demo-');
const demoKey = (id, k) => `rf_demo_${k}_${id}`;

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const safeDel = (k) => { try { localStorage.removeItem(k); } catch { /* sem storage */ } };

const notify = () => window.dispatchEvent(new Event('rf-profile'));

// ── Foto ──
export function avatarSrc(userId) {
    if (!userId) return '';
    if (isDemoUser(userId)) return safeGet(demoKey(userId, 'avatar')) || '';
    if (safeGet(`rf_avatar_off_${userId}`) === '1') return '';
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(`avatars/${userId}.jpg`);
    const v = safeGet(`rf_avatar_v_${userId}`);
    return v ? `${data.publicUrl}?v=${v}` : data.publicUrl;
}

export function useAvatar(userId) {
    const [src, setSrc] = useState(() => avatarSrc(userId));
    useEffect(() => {
        const on = () => setSrc(avatarSrc(userId));
        on();
        window.addEventListener('rf-profile', on);
        return () => window.removeEventListener('rf-profile', on);
    }, [userId]);
    return src;
}

// recorta ao centro em quadrado e reduz (a foto não precisa de mais que isso)
async function toSquareBlob(file, size = 320) {
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem.'))), 'image/jpeg', 0.86));
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
});

export async function uploadAvatar(userId, file) {
    if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
    const blob = await toSquareBlob(file);
    if (isDemoUser(userId)) {
        safeSet(demoKey(userId, 'avatar'), await blobToDataUrl(blob));
    } else {
        const { error } = await supabase.storage.from(BUCKET).upload(`avatars/${userId}.jpg`, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
        if (error) throw new Error('Não foi possível enviar a foto. Tente novamente.');
        safeDel(`rf_avatar_off_${userId}`);
        safeSet(`rf_avatar_v_${userId}`, String(Date.now()));
    }
    notify();
}

export async function removeAvatar(userId) {
    if (isDemoUser(userId)) safeDel(demoKey(userId, 'avatar'));
    else {
        await supabase.storage.from(BUCKET).remove([`avatars/${userId}.jpg`]);
        safeSet(`rf_avatar_off_${userId}`, '1');
    }
    notify();
}

// ── Dados ──
export async function loadProfile(userId) {
    if (isDemoUser(userId)) {
        let extra = {};
        try { extra = JSON.parse(safeGet(demoKey(userId, 'profile')) || '{}'); } catch { /* ignora */ }
        return {
            id: userId,
            nome_completo: safeGet('rf_user_name') || '',
            email: safeGet('rf_user_email') || '',
            telefone: '',
            ...extra,
        };
    }
    const { data, error } = await supabase.from('perfis').select('*').eq('id', userId).single();
    if (error || !data) throw new Error('Não foi possível carregar seu perfil.');
    const { senha, ...safe } = data; // a senha nunca vai para a tela
    return safe;
}

export async function saveProfile(userId, fields) {
    if (isDemoUser(userId)) {
        const { nome_completo, ...rest } = fields;
        safeSet(demoKey(userId, 'profile'), JSON.stringify(rest));
        if (nome_completo) safeSet('rf_user_name', nome_completo);
    } else {
        const { error } = await supabase.from('perfis').update(fields).eq('id', userId);
        if (error) throw new Error('Não foi possível salvar. Tente novamente.');
        if (fields.nome_completo) safeSet('rf_user_name', fields.nome_completo);
    }
    notify();
}

export const initialsOf = (name = '') => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'RF';
