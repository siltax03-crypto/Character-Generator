// Random Character Generator - SillyTavern Extension
// Features: ConnectionManager profile, user persona, translation toggle, character list management

import { getContext, extension_settings } from '../../../extensions.js';
import {
    saveSettingsDebounced,
    generateQuietPrompt,
    getRequestHeaders,
    event_types,
    eventSource,
    selectCharacterById,
    characters,
    this_chid,
} from '../../../../script.js';

const extensionName = 'random-character';

const defaultSettings = {
    language: 'ko',
    nsfw: true,
    user_persona: '',
    profile_id: '', // ConnectionManager profile ID
    created_characters: [],
};

let generatedData = null;

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    Object.assign(extension_settings[extensionName], {
        ...defaultSettings,
        ...extension_settings[extensionName],
    });
}

function getSettings() {
    return extension_settings[extensionName];
}

// ============================================================
// AI SERVICE - ConnectionManager or fallback
// ============================================================
function getAvailableProfiles() {
    try {
        const ctx = getContext();
        return ctx.extensionSettings?.connectionManager?.profiles || [];
    } catch {
        return [];
    }
}

async function aiGenerate(prompt) {
    const s = getSettings();
    const profileId = s.profile_id;
    const ctx = getContext();

    // Try ConnectionManager first
    if (profileId && ctx.ConnectionManagerRequestService) {
        try {
            const profiles = getAvailableProfiles();
            const profile = profiles.find(p => p.id === profileId);
            if (profile) {
                console.log(`[RCG] Using connection profile: ${profile.name || profile.id}`);
                const response = await ctx.ConnectionManagerRequestService.sendRequest(
                    profileId,
                    [{ role: 'user', content: prompt }],
                    4096
                );
                return response?.content || '';
            }
        } catch (e) {
            console.warn('[RCG] ConnectionManager failed, fallback:', e);
        }
    }

    // Fallback to main API
    console.log('[RCG] Using main API (generateQuietPrompt)');
    return await generateQuietPrompt(prompt, false, false);
}

// ============================================================
// RANDOM CARD IN CHARACTER LIST
// ============================================================
function injectRandomCard() {
    $('#random_char_card_entry').remove();

    const card = $(`
        <div id="random_char_card_entry" class="random_char_card" title="랜덤 캐릭터 생성">
            <div class="random_char_card_icon">🎲</div>
            <div class="random_char_card_text">
                <span class="name">캐릭터 생성</span>
                <span class="desc">클릭하여 캐릭터 생성</span>
            </div>
        </div>
    `);

    card.on('click', () => openPopup());

    const containers = ['#rm_print_characters_block', '#rm_characters_block', '.character_select_container'];
    for (const sel of containers) {
        const c = $(sel);
        if (c.length) { c.prepend(card); return; }
    }
}

// ============================================================
// POPUP HTML
// ============================================================
function getPopupHTML() {
    const s = getSettings();
    return `
    <div class="rcg_overlay" id="rcg_overlay">
        <div class="rcg_popup">
            <div class="rcg_popup_header">
                <h3>🎲 캐릭터 생성</h3>
                <button class="rcg_close_btn" id="rcg_close">✕</button>
            </div>

            <div class="rcg_popup_body">
                <!-- Mode Toggle -->
                <div class="rcg_mode_toggle">
                    <button class="rcg_mode_btn active" data-mode="canon">📖 원작 캐릭터</button>
                    <button class="rcg_mode_btn" data-mode="original">✨ 오리지널</button>
                </div>

                <!-- Canon Mode -->
                <div id="rcg_canon_fields">
                    <div class="rcg_section">
                        <label>원작 / 작품명</label>
                        <input type="text" id="rcg_source" placeholder="예: Jujutsu Kaisen, Arcane, 귀멸의 칼날..." />
                    </div>
                    <div class="rcg_section">
                        <label>캐릭터 이름</label>
                        <input type="text" id="rcg_canon_name" placeholder="예: Gojo Satoru, Jinx..." />
                    </div>
                    <div class="rcg_section">
                        <label>{{user}}와의 관계</label>
                        <input type="text" id="rcg_canon_relation" placeholder="예: 연인, 소꿉친구, 라이벌, 선생님..." />
                    </div>
                    <div class="rcg_section">
                        <label>추가 설정 / 커스텀 (선택)</label>
                        <textarea id="rcg_canon_extra" placeholder="원작과 다른 설정, 특별한 시나리오, AU 세계관 등..."></textarea>
                    </div>
                </div>

                <!-- Original Mode -->
                <div id="rcg_original_fields" style="display:none;">
                    <div class="rcg_section">
                        <label>캐릭터 이름</label>
                        <input type="text" id="rcg_orig_name" placeholder="예: Kai, 서하윤, Baron..." />
                    </div>
                    <div class="rcg_row">
                        <div class="rcg_section">
                            <label>성별</label>
                            <select id="rcg_orig_gender">
                                <option value="male">남성</option>
                                <option value="female">여성</option>
                                <option value="nonbinary">논바이너리</option>
                                <option value="other">기타</option>
                            </select>
                        </div>
                        <div class="rcg_section">
                            <label>나이</label>
                            <input type="text" id="rcg_orig_age" placeholder="예: 27, 20대 후반..." />
                        </div>
                    </div>
                    <div class="rcg_section">
                        <label>외모 / 키워드</label>
                        <input type="text" id="rcg_orig_appearance" placeholder="예: 은발, 키 큼, 문신, 피어싱..." />
                    </div>
                    <div class="rcg_section">
                        <label>성격 키워드</label>
                        <input type="text" id="rcg_orig_personality" placeholder="예: 차가운, 츤데레, 장난끼, 보호적..." />
                    </div>
                    <div class="rcg_section">
                        <label>배경 / 세계관</label>
                        <input type="text" id="rcg_orig_setting" placeholder="예: 현대, 판타지, 마피아, 학원..." />
                    </div>
                    <div class="rcg_section">
                        <label>{{user}}와의 관계</label>
                        <input type="text" id="rcg_orig_relation" placeholder="예: 연인, 소꿉친구, 계약 관계..." />
                    </div>
                    <div class="rcg_section">
                        <label>추가 설정 (선택)</label>
                        <textarea id="rcg_orig_extra" placeholder="추가 디테일, 비밀, 목표 등..."></textarea>
                    </div>
                </div>

                <!-- User Persona (collapsible) -->
                <div class="rcg_persona_section">
                    <div class="rcg_persona_toggle" id="rcg_persona_toggle">
                        <span>👤 유저 페르소나 설정</span>
                        <span class="rcg_persona_arrow">▸</span>
                    </div>
                    <div class="rcg_persona_body" id="rcg_persona_body" style="display:none;">
                        <textarea id="rcg_popup_persona" placeholder="예: 20대 여성, 대학생, 내성적, 검은 장발...">${escapeHtml(s.user_persona)}</textarea>
                        <p class="rcg_persona_hint">캐릭터 생성 시 {{user}} 설정에 반영됩니다</p>
                    </div>
                </div>

                <!-- Language & NSFW -->
                <div class="rcg_row">
                    <div class="rcg_section" style="flex:1;">
                        <label>생성 언어</label>
                        <select id="rcg_language">
                            <option value="ko" ${s.language === 'ko' ? 'selected' : ''}>한국어</option>
                            <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
                            <option value="ja" ${s.language === 'ja' ? 'selected' : ''}>日本語</option>
                        </select>
                    </div>
                    <div class="rcg_section" style="flex:1; flex-direction:row; align-items:flex-end; gap:8px;">
                        <input type="checkbox" id="rcg_nsfw" ${s.nsfw ? 'checked' : ''} />
                        <label for="rcg_nsfw" style="text-transform:none; cursor:pointer; font-size:12px;">NSFW 포함</label>
                    </div>
                </div>

                <!-- Generate -->
                <button class="rcg_generate_btn" id="rcg_generate">🎲 캐릭터 생성</button>

                <!-- Preview -->
                <div class="rcg_preview" id="rcg_preview">
                    <div class="rcg_preview_header">
                        <span>생성 결과</span>
                        <div class="rcg_preview_actions">
                            <button class="rcg_preview_tab active" data-tab="description">Description</button>
                            <button class="rcg_preview_tab" data-tab="personality">Personality</button>
                            <button class="rcg_preview_tab" data-tab="first_mes">First Message</button>
                        </div>
                    </div>
                    <div class="rcg_translate_bar" id="rcg_translate_bar" style="display:none;">
                        <button class="rcg_translate_toggle active" data-lang="original">원문</button>
                        <button class="rcg_translate_toggle" data-lang="ko">🇰🇷 번역</button>
                    </div>
                    <div class="rcg_preview_content" id="rcg_preview_content"></div>
                </div>
            </div>

            <!-- Footer -->
            <div class="rcg_popup_footer" id="rcg_footer" style="display:none;">
                <button class="rcg_footer_btn rcg_btn_regen" id="rcg_regen">🔄 재생성</button>
                <button class="rcg_footer_btn rcg_btn_chat" id="rcg_start_chat">💬 저장 & 대화 시작</button>
            </div>
        </div>
    </div>
    `;
}

// ============================================================
// POPUP LOGIC
// ============================================================
function openPopup() {
    $('#rcg_overlay').remove();
    generatedData = null;
    $('body').append(getPopupHTML());
    bindPopupEvents();
}

function closePopup() {
    $('#rcg_overlay').remove();
    generatedData = null;
}

function bindPopupEvents() {
    $('#rcg_close').on('click', closePopup);
    $('#rcg_overlay').on('click', (e) => {
        if ($(e.target).hasClass('rcg_overlay')) closePopup();
    });

    // Mode
    $('.rcg_mode_btn').on('click', function () {
        $('.rcg_mode_btn').removeClass('active');
        $(this).addClass('active');
        const mode = $(this).data('mode');
        $('#rcg_canon_fields').toggle(mode === 'canon');
        $('#rcg_original_fields').toggle(mode === 'original');
    });

    // Persona toggle
    $('#rcg_persona_toggle').on('click', function () {
        const body = $('#rcg_persona_body');
        const arrow = $(this).find('.rcg_persona_arrow');
        const isVisible = body.is(':visible');
        body.slideToggle(200);
        arrow.text(isVisible ? '▸' : '▾');
    });

    // Persona sync
    $('#rcg_popup_persona').on('input', function () {
        getSettings().user_persona = $(this).val();
        saveSettingsDebounced();
        $('#rcg_settings_persona').val($(this).val());
    });

    // Preview tabs
    $(document).on('click', '.rcg_preview_tab', function () {
        $('.rcg_preview_tab').removeClass('active');
        $(this).addClass('active');
        updatePreviewContent();
    });

    // Translation toggle
    $(document).on('click', '.rcg_translate_toggle', function () {
        $('.rcg_translate_toggle').removeClass('active');
        $(this).addClass('active');
        updatePreviewContent();
    });

    // Settings
    $('#rcg_language').on('change', function () {
        getSettings().language = $(this).val();
        saveSettingsDebounced();
    });
    $('#rcg_nsfw').on('change', function () {
        getSettings().nsfw = $(this).is(':checked');
        saveSettingsDebounced();
    });

    // Buttons
    $('#rcg_generate').on('click', () => generateCharacter());
    $('#rcg_regen').on('click', () => generateCharacter());
    $('#rcg_start_chat').on('click', () => saveAndStartChat());
}

function updatePreviewContent() {
    if (!generatedData) return;
    const tab = $('.rcg_preview_tab.active').data('tab') || 'description';
    const isTranslated = $('.rcg_translate_toggle.active').data('lang') === 'ko';

    let content = '';
    if (isTranslated && generatedData.translations) {
        content = generatedData.translations[tab] || '(번역 없음)';
    } else {
        content = generatedData[tab] || '(없음)';
    }
    $('#rcg_preview_content').text(content);
}

// ============================================================
// PROMPT BUILDING
// ============================================================
function buildGenerationPrompt() {
    const isCanon = $('.rcg_mode_btn.active').data('mode') === 'canon';
    const lang = $('#rcg_language').val();
    const includeNSFW = $('#rcg_nsfw').is(':checked');
    const userPersona = $('#rcg_popup_persona').val()?.trim() || '';

    const langMap = { ko: '한국어', en: 'English', ja: '日本語' };
    const langLabel = langMap[lang] || 'English';
    const needsTranslation = lang !== 'ko';

    let userInput = '';

    if (isCanon) {
        const source = $('#rcg_source').val().trim();
        const name = $('#rcg_canon_name').val().trim();
        const relation = $('#rcg_canon_relation').val().trim();
        const extra = $('#rcg_canon_extra').val().trim();

        if (!source || !name) {
            showToast('원작명과 캐릭터 이름을 입력해주세요!');
            return null;
        }

        userInput = `[CANON CHARACTER]
Source/Series: ${source}
Character Name: ${name}
Relationship with {{user}}: ${relation || 'Not specified - decide freely'}
Additional Settings: ${extra || 'None'}`;
    } else {
        const name = $('#rcg_orig_name').val().trim();
        const gender = $('#rcg_orig_gender').val();
        const age = $('#rcg_orig_age').val().trim();
        const appearance = $('#rcg_orig_appearance').val().trim();
        const personality = $('#rcg_orig_personality').val().trim();
        const setting = $('#rcg_orig_setting').val().trim();
        const relation = $('#rcg_orig_relation').val().trim();
        const extra = $('#rcg_orig_extra').val().trim();

        if (!name) {
            showToast('캐릭터 이름을 입력해주세요!');
            return null;
        }

        userInput = `[ORIGINAL CHARACTER]
Character Name: ${name}
Gender: ${gender}
Age: ${age || 'Not specified'}
Appearance Keywords: ${appearance || 'Not specified'}
Personality Keywords: ${personality || 'Not specified'}
Setting/World: ${setting || 'Not specified'}
Relationship with {{user}}: ${relation || 'Not specified - decide freely'}
Additional Settings: ${extra || 'None'}`;
    }

    if (userPersona) {
        userInput += `

[USER PERSONA - {{user}}'s character settings]
${userPersona}
(IMPORTANT: Incorporate these {{user}} details into the character's Connections section, relationship dynamics, behavior patterns, and first message. The character should react to and interact with {{user}} based on these traits.)`;
    }

    const nsfwSection = includeNSFW ? `
- Include a "## Sexuality" section with: Sexual Orientation, Role during sex, Kinks, and Sexual Quirks/Habits.
- Be explicit and detailed in the sexuality section.` : `
- Do NOT include any sexual or NSFW content.`;

    const translationFields = needsTranslation ? `

ADDITIONALLY, provide Korean translations of ALL three fields.
Add these extra fields to the JSON:
  "description_ko": "...",
  "personality_ko": "...",
  "first_mes_ko": "..."
The Korean translations should be natural, fluent Korean.` : '';

    const jsonFormat = needsTranslation
        ? `{ "description": "...", "personality": "...", "first_mes": "...", "description_ko": "...", "personality_ko": "...", "first_mes_ko": "..." }`
        : `{ "description": "...", "personality": "...", "first_mes": "..." }`;

    const prompt = `[System]
You are a character card generator for a roleplay chat system.
Based on the user's input, generate a COMPLETE, DETAILED character card.

OUTPUT FORMAT: You must output ONLY valid JSON with these fields:
${jsonFormat}

RULES FOR "description":
- Write in ${langLabel}.
- Use the following structured format with ## headers:
  ## Character Overview (2-3 sentences summarizing the character)
  ## Appearance Details (Name, Height, Age, Skin, Gender, Hair, Eyes, Body, Face - be specific)
  ## Origin (backstory, 2-4 sentences)
  ## Residence (where they live)
  ## Personality and Traits (Archetype, Personality Tags, Likes, Dislikes, With {{user}})
  ## Goal (character's main goal)
  ## Secret (a hidden secret)
  ## Behavior and Habits (5+ specific behavioral details)
  ${includeNSFW ? '## Sexuality (orientation, role, kinks, quirks)' : ''}
  ## Speech (style, quirks, ticks)
  ## Connections (relationship with {{user}} and 2-3 other NPCs)
  ## AI Guidance (3-4 bullet points for roleplay behavior)
- Include a "prefix" line at the very top with comma-separated appearance keywords for image generation.
- If this is a CANON character, stay faithful to the source material but adapt the relationship with {{user}} as specified.
- If USER PERSONA is provided, reflect {{user}}'s traits in Connections and interactions.
${nsfwSection}

RULES FOR "personality":
- Write in ${langLabel}. Concise summary (2-3 sentences) of core traits.

RULES FOR "first_mes":
- Write in ${langLabel}.
- Vivid, atmospheric opening IN CHARACTER (3-8 paragraphs).
- Set scene, describe environment, interact with {{user}}.
- Use *italics for actions* and "quotes for dialogue".
- If USER PERSONA is provided, reference {{user}}'s appearance/traits naturally.
- Do NOT use {{char}}. Use character name or pronouns.
${translationFields}

CRITICAL:
- Output ONLY the JSON object. No markdown fences, no explanation.
- All string values must be properly escaped for JSON.
- Description at least 2000 characters. First message at least 800 characters.

[User Input]
${userInput}`;

    return { prompt, needsTranslation };
}

// ============================================================
// GENERATE
// ============================================================
async function generateCharacter() {
    const result = buildGenerationPrompt();
    if (!result) return;

    const { prompt, needsTranslation } = result;
    const generateBtn = $('#rcg_generate');
    const regenBtn = $('#rcg_regen');
    const chatBtn = $('#rcg_start_chat');

    generateBtn.prop('disabled', true).html('<span class="rcg_spinner"></span> 생성 중...');
    regenBtn.prop('disabled', true);
    chatBtn.prop('disabled', true);

    try {
        const response = await aiGenerate(prompt);

        if (!response) throw new Error('API 응답이 비어있습니다.');

        console.log('[RCG] Raw response (first 500):', response.substring(0, 500));

        let parsed = null;

        // Clean response: remove markdown fences, BOM, leading/trailing junk
        let cleaned = response
            .replace(/^\uFEFF/, '')
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();

        // Try direct parse
        try {
            parsed = JSON.parse(cleaned);
        } catch (e1) {
            console.log('[RCG] Direct parse failed:', e1.message);

            // Extract JSON object with greedy match
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                let extracted = jsonMatch[0];
                try {
                    parsed = JSON.parse(extracted);
                } catch (e2) {
                    console.log('[RCG] Extracted parse failed:', e2.message);

                    // Fix common issues: unescaped newlines, tabs inside strings
                    try {
                        // Replace literal newlines/tabs inside JSON string values
                        extracted = extracted
                            .replace(/\r\n/g, '\\n')
                            .replace(/\r/g, '\\n')
                            .replace(/\t/g, '\\t');
                        // Try again with control chars escaped
                        extracted = extracted.replace(/[\x00-\x1F\x7F]/g, (c) => {
                            if (c === '\n' || c === '\r' || c === '\t') return c === '\t' ? '\\t' : '\\n';
                            return '';
                        });
                        parsed = JSON.parse(extracted);
                    } catch (e3) {
                        console.log('[RCG] Fixed parse failed:', e3.message);
                        console.log('[RCG] Attempted to parse:', extracted.substring(0, 300));
                    }
                }
            }
        }

        if (!parsed || !parsed.description) {
            throw new Error('생성 결과를 파싱할 수 없습니다. 재생성해주세요.');
        }

        generatedData = {
            description: parsed.description || '',
            personality: parsed.personality || '',
            first_mes: parsed.first_mes || parsed.first_message || '',
            translations: null,
        };

        if (needsTranslation && (parsed.description_ko || parsed.personality_ko || parsed.first_mes_ko)) {
            generatedData.translations = {
                description: parsed.description_ko || '',
                personality: parsed.personality_ko || '',
                first_mes: parsed.first_mes_ko || '',
            };
        }

        const isCanon = $('.rcg_mode_btn.active').data('mode') === 'canon';
        generatedData.name = isCanon
            ? $('#rcg_canon_name').val().trim()
            : $('#rcg_orig_name').val().trim();
        generatedData.mode = isCanon ? 'canon' : 'original';
        generatedData.source = isCanon ? $('#rcg_source').val().trim() : '';

        // Show preview
        $('#rcg_preview').addClass('show');
        if (needsTranslation && generatedData.translations) {
            $('#rcg_translate_bar').show();
            $('.rcg_translate_toggle').removeClass('active');
            $('.rcg_translate_toggle[data-lang="original"]').addClass('active');
        } else {
            $('#rcg_translate_bar').hide();
        }
        $('.rcg_preview_tab').first().click();
        $('#rcg_footer').show();

        showToast('✅ 캐릭터 생성 완료!');
    } catch (error) {
        console.error('[RCG] Generation error:', error);
        showToast(`❌ 생성 실패: ${error.message}`);
    } finally {
        generateBtn.prop('disabled', false).html('🎲 캐릭터 생성');
        regenBtn.prop('disabled', false);
        chatBtn.prop('disabled', false);
    }
}

// ============================================================
// SAVE & START CHAT
// ============================================================
async function saveAndStartChat() {
    if (!generatedData) {
        showToast('먼저 캐릭터를 생성해주세요!');
        return;
    }

    const chatBtn = $('#rcg_start_chat');
    chatBtn.prop('disabled', true).text('저장 중...');

    try {
        const charName = generatedData.name || 'Random Character';
        const existingChar = characters.find(c => c.name === charName);
        const finalName = existingChar
            ? `${charName}_${Date.now().toString(36).slice(-4)}`
            : charName;

        // Build FormData - match ST's exact format
        const formData = new FormData();
        formData.append('ch_name', finalName);
        formData.append('avatar', new File([], ''), '');
        formData.append('fav', 'false');
        formData.append('description', generatedData.description);
        formData.append('first_mes', generatedData.first_mes);
        formData.append('json_data', '');
        formData.append('avatar_url', '');
        formData.append('chat', '');
        formData.append('create_date', '');
        formData.append('last_mes', '');
        formData.append('world', '');
        formData.append('system_prompt', '');
        formData.append('post_history_instructions', '');
        formData.append('creator', '');
        formData.append('character_version', '');
        formData.append('creator_notes', 'Generated by Random Character Generator.');
        formData.append('tags', '');
        formData.append('personality', generatedData.personality);
        formData.append('scenario', '');
        formData.append('depth_prompt_prompt', '');
        formData.append('depth_prompt_depth', '4');
        formData.append('depth_prompt_role', 'system');
        formData.append('talkativeness', '0.5');
        formData.append('mes_example', '');
        formData.append('extensions', '{}');

        const headers = getRequestHeaders();
        delete headers['Content-Type'];

        const createResponse = await fetch('/api/characters/create', {
            method: 'POST',
            headers: headers,
            body: formData,
        });

        if (!createResponse.ok) {
            const errText = await createResponse.text();
            console.error('[RCG] Create response:', errText);
            throw new Error(`캐릭터 생성 API 오류: ${createResponse.status} - ${errText}`);
        }

        // Save to list
        const s = getSettings();
        s.created_characters.push({
            name: finalName,
            createdAt: Date.now(),
            mode: generatedData.mode || 'original',
            source: generatedData.source || '',
        });
        saveSettingsDebounced();
        refreshSettingsList();

        showToast(`✅ "${finalName}" 저장 완료!`);
        closePopup();

        // Reload character list & select
        await new Promise(r => setTimeout(r, 500));

        // Trigger ST's own character list reload
        const ctx = getContext();
        if (typeof ctx.getCharacters === 'function') {
            await ctx.getCharacters();
        }

        await new Promise(r => setTimeout(r, 500));

        // Try to select
        const charElement = $(`.character_select[chid]`).filter(function () {
            return $(this).find('.ch_name').text().trim() === finalName;
        });

        if (charElement.length) {
            charElement[0].dispatchEvent(new Event('click'));
        } else {
            const idx = characters.findIndex(c => c.name === finalName);
            if (idx >= 0) {
                await selectCharacterById(String(idx));
            } else {
                showToast('캐릭터 목록에서 직접 선택해주세요: ' + finalName);
            }
        }
    } catch (error) {
        console.error('[RCG] Save error:', error);
        showToast(`❌ 저장 실패: ${error.message}`);
    } finally {
        chatBtn.prop('disabled', false).text('💬 저장 & 대화 시작');
    }
}

// ============================================================
// DELETE
// ============================================================
async function deleteCharacterByName(charName) {
    if (!confirm(`"${charName}" 캐릭터를 삭제하시겠습니까?\n대화 기록도 함께 삭제됩니다.`)) return;

    try {
        const charIndex = characters.findIndex(c => c.name === charName);
        if (charIndex >= 0) {
            await fetch('/api/characters/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    avatar_url: characters[charIndex].avatar,
                    delete_chats: true,
                }),
            });
        }

        const s = getSettings();
        s.created_characters = s.created_characters.filter(c => c.name !== charName);
        saveSettingsDebounced();
        refreshSettingsList();
        showToast(`🗑️ "${charName}" 삭제됨`);

        if (this_chid !== undefined && characters[this_chid]?.name === charName) {
            $('#rm_button_back').trigger('click');
        }
    } catch (error) {
        console.error('[RCG] Delete error:', error);
        showToast(`❌ 삭제 실패: ${error.message}`);
    }
}

// ============================================================
// SETTINGS PANEL
// ============================================================
function addSettingsPanel() {
    const s = getSettings();
    const profiles = getAvailableProfiles();

    let profileOptions = '<option value="">기본 API (메인 채팅과 공유)</option>';
    for (const p of profiles) {
        const selected = s.profile_id === p.id ? 'selected' : '';
        const label = p.name || `${p.api} ${p.model || ''}`.trim() || p.id;
        profileOptions += `<option value="${p.id}" ${selected}>${label}</option>`;
    }

    const settingsHTML = `
    <div id="rcg_settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎲 캐릭터 생성 설정</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div style="padding: 8px 0;">
                    <!-- Connection Profile -->
                    <div class="rcg_section" style="margin-bottom: 10px;">
                        <label style="font-size: 12px; margin-bottom: 4px;">🔌 연결 프로필</label>
                        <select id="rcg_settings_profile" class="text_pole">
                            ${profileOptions}
                        </select>
                        <small style="font-size: 10px; opacity: 0.5;">별도 프로필 선택 시 메인 채팅과 독립적으로 생성</small>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(settingsHTML);


    refreshSettingsList();
}

function refreshSettingsList() {
    const s = getSettings();
    const list = s.created_characters || [];
    const $container = $('#rcg_char_list');
    const $count = $('#rcg_list_count');

    if (!$container.length) return;

    $count.text(`${list.length}개`);

    if (list.length === 0) {
        $container.html('<div class="rcg_list_empty">생성된 캐릭터가 없습니다</div>');
        return;
    }

    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    let html = '';
    for (const char of sorted) {
        const date = char.createdAt ? new Date(char.createdAt).toLocaleDateString('ko-KR') : '';
        const modeIcon = char.mode === 'canon' ? '📖' : '✨';
        const sourceLabel = char.source ? ` · ${char.source}` : '';

        html += `
        <div class="rcg_list_item" data-name="${escapeHtml(char.name)}">
            <div class="rcg_list_item_info">
                <span class="rcg_list_item_name">${modeIcon} ${escapeHtml(char.name)}</span>
                <span class="rcg_list_item_meta">${date}${sourceLabel}</span>
            </div>
            <div class="rcg_list_item_actions">
                <button class="rcg_list_select_btn" title="캐릭터 선택">💬</button>
                <button class="rcg_list_delete_btn" title="삭제">🗑️</button>
            </div>
        </div>`;
    }

    $container.html(html);

    $container.find('.rcg_list_delete_btn').on('click', function () {
        const name = $(this).closest('.rcg_list_item').data('name');
        deleteCharacterByName(name);
    });

    $container.find('.rcg_list_select_btn').on('click', function () {
        const name = $(this).closest('.rcg_list_item').data('name');
        selectCharByName(name);
    });
}

async function selectCharByName(name) {
    const charElement = $(`.character_select[chid]`).filter(function () {
        return $(this).find('.ch_name').text().trim() === name;
    });

    if (charElement.length) {
        charElement[0].dispatchEvent(new Event('click'));
    } else {
        const idx = characters.findIndex(c => c.name === name);
        if (idx >= 0) {
            await selectCharacterById(String(idx));
        } else {
            showToast(`"${name}" 캐릭터를 찾을 수 없습니다.`);
        }
    }
}

// ============================================================
// UTILITIES
// ============================================================
function showToast(message, duration = 3000) {
    $('.rcg_toast').remove();
    const toast = $(`<div class="rcg_toast">${message}</div>`);
    $('body').append(toast);
    setTimeout(() => toast.fadeOut(300, () => toast.remove()), duration);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// INIT
// ============================================================
jQuery(async () => {
    loadSettings();
    addSettingsPanel();

    const tryInject = () => injectRandomCard();
    setTimeout(tryInject, 1500);
    setTimeout(tryInject, 3000);

    const observer = new MutationObserver(() => {
        if ($('#random_char_card_entry').length === 0) tryInject();
    });

    setTimeout(() => {
        for (const sel of ['#rm_print_characters_block', '#rm_characters_block']) {
            const el = document.querySelector(sel);
            if (el) { observer.observe(el, { childList: true, subtree: true }); break; }
        }
    }, 2000);

    console.log('[RCG] Random Character Generator loaded!');
});
