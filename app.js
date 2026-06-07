/**
 * 政府採購法函釋檢索系統 - 前端核心邏輯
 * 
 * 採用非同步背景區塊載入 (Chunk Lazy Loading) 技術
 * 確保 7.3MB 的資料在 GitHub Pages 靜態網站架構下能流暢運行。
 */

// === 全域狀態管理 ===
let allData = [];            // 背景載入的所有原始資料
let filteredData = [];       // 符合目前篩選條件的資料
let currentPage = 1;         // 目前分頁頁碼 (1-based)
let itemsPerPage = 20;       // 每頁顯示筆數

let totalChunks = 0;         // 資料區塊總數
let loadedChunks = 0;        // 已載入區塊數
let manifest = null;         // 存放 manifest 資訊

let geminiApiKey = localStorage.getItem('gemini_api_key') || '';

// 搜尋條件快取
const searchCriteria = {
    docNum: '',
    article: '',
    date: '',
    title: '',
    content: ''
};

// === DOM 元素選取 ===
const searchForm = document.getElementById('search-form');
const btnReset = document.getElementById('btn-reset');
const resultsContainer = document.getElementById('results-container');
const resultsCount = document.getElementById('results-count');
const filterStatus = document.getElementById('filter-status');
const perPageSelect = document.getElementById('per-page-select');
const paginationContainer = document.getElementById('pagination-container');
const themeToggleBtn = document.getElementById('theme-toggle');
const loadingWidget = document.getElementById('loading-widget');
const loadingStatusText = document.getElementById('loading-status-text');
const progressBar = document.getElementById('progress-bar');

// AI 解答博士 DOM 元素
const tabStandard = document.getElementById('tab-standard');
const tabAi = document.getElementById('tab-ai');
const standardSearchContainer = document.getElementById('standard-search-container');
const aiSearchContainer = document.getElementById('ai-search-container');
const aiQuestionInput = document.getElementById('ai-question');
const btnAiSubmit = document.getElementById('btn-ai-submit');
const aiGuideContainer = document.getElementById('ai-guide-container');

// API Modal Elements
const apiKeyConfigBtn = document.getElementById('api-key-config');
const apiModal = document.getElementById('api-modal');
const modalClose = document.getElementById('modal-close');
const apiKeyInput = document.getElementById('api-key-input');
const btnSaveKey = document.getElementById('btn-save-key');

// === 初始化設定 ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadManifest();
    setupEventListeners();
});

// === 主題切換 (Dark/Light Theme) ===
function initTheme() {
    // 優先順序：1. LocalStorage 2. 系統偏好
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// === 事件監聽器設定 ===
function setupEventListeners() {
    // 主題切換
    themeToggleBtn.addEventListener('click', toggleTheme);

    // 搜尋表單提交
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        performSearch();
    });

    // 表單重設
    btnReset.addEventListener('click', () => {
        searchForm.reset();
        aiGuideContainer.innerHTML = ''; // 清除 AI 導讀卡片
        performSearch(); // 重設後自動搜尋空條件以還原全部資料
    });

    // 每頁筆數變更
    perPageSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderResults();
    });

    // Tab 切換
    tabStandard.addEventListener('click', () => switchTab('standard'));
    tabAi.addEventListener('click', () => switchTab('ai'));

    // API Modal 開關與儲存
    apiKeyConfigBtn.addEventListener('click', openApiModal);
    modalClose.addEventListener('click', closeApiModal);
    btnSaveKey.addEventListener('click', saveApiKey);
    
    // 點擊 Modal 外部也可關閉
    apiModal.addEventListener('click', (e) => {
        if (e.target === apiModal) closeApiModal();
    });

    // AI 解答博士提交
    btnAiSubmit.addEventListener('click', handleAiSearch);
}

// === 資料載入機制 ===
async function loadManifest() {
    try {
        const response = await fetch('data/manifest.json');
        if (!response.ok) throw new Error('無法載入 manifest.json');
        
        manifest = await response.json();
        totalChunks = manifest.total_chunks;
        
        // 開始背景非同步載入區塊
        loadChunksSequentially(manifest.chunks);
    } catch (err) {
        console.error('載入索引失敗：', err);
        loadingStatusText.textContent = '資料載入錯誤';
        loadingWidget.classList.add('error');
    }
}

async function loadChunksSequentially(chunks) {
    for (const chunk of chunks) {
        try {
            const response = await fetch(chunk.filename);
            if (!response.ok) throw new Error(`無法載入區塊: ${chunk.filename}`);
            
            const chunkData = await response.json();
            allData = allData.concat(chunkData);
            loadedChunks++;
            
            // 更新進度條 UI
            updateLoadingProgress();
            
            // 當前載入新區塊時，若處於「顯示全部」或有「搜尋中」，動態更新資料
            // 由於是非同步背景載入，這樣使用者可以邊載入邊看到搜尋結果增加
            refreshSearchResultsSilently();
            
            // 稍微延遲以避免瀏覽器執行緒阻塞，使 UI 更流暢
            await new Promise(resolve => setTimeout(resolve, 30));
        } catch (err) {
            console.error(`載入區塊 ${chunk.id} 失敗:`, err);
        }
    }
}

function updateLoadingProgress() {
    const percentage = Math.round((loadedChunks / totalChunks) * 100);
    progressBar.style.width = `${percentage}%`;
    
    if (loadedChunks === totalChunks) {
        loadingWidget.classList.remove('loading');
        loadingWidget.classList.add('complete');
        loadingStatusText.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;"><polyline points="20 6 9 17 4 12"/></svg>
            資料已就緒 (共 ${allData.length} 筆)
        `;
    } else {
        loadingStatusText.textContent = `載入背景資料區 (${loadedChunks}/${totalChunks})`;
    }
}

// === 搜尋篩選演算法 ===
function performSearch() {
    // 讀取輸入欄位值
    searchCriteria.docNum = document.getElementById('search-doc-num').value.trim();
    searchCriteria.article = document.getElementById('search-article').value.trim();
    searchCriteria.date = document.getElementById('search-date').value.trim();
    searchCriteria.title = document.getElementById('search-title').value.trim();
    searchCriteria.content = document.getElementById('search-content').value.trim();

    // 更新篩選狀態文字
    const activeFilters = [];
    if (searchCriteria.docNum) activeFilters.push(`發文字號: "${searchCriteria.docNum}"`);
    if (searchCriteria.article) activeFilters.push(`條文: "${searchCriteria.article}"`);
    if (searchCriteria.date) activeFilters.push(`日期: "${searchCriteria.date}"`);
    if (searchCriteria.title) activeFilters.push(`主題: "${searchCriteria.title}"`);
    if (searchCriteria.content) activeFilters.push(`內文: "${searchCriteria.content}"`);

    if (activeFilters.length > 0) {
        filterStatus.textContent = `篩選條件: ${activeFilters.join(' & ')}`;
    } else {
        filterStatus.textContent = '顯示全部';
    }

    // 執行篩選
    executeFilter();
    
    currentPage = 1;
    renderResults();
}

/**
 * 為了支援邊下載背景資料邊更新結果的平滑體驗，
 * 此函式在資料塊抵達時靜態調用，不影響使用者的滾動或輸入。
 */
function refreshSearchResultsSilently() {
    executeFilter();
    renderResults(true); // true 表示靜態更新，保持當前頁面
}

function executeFilter() {
    const { docNum, article, date, title, content } = searchCriteria;
    
    // 多條件 AND 交集篩選
    filteredData = allData.filter(item => {
        // 發文字號篩選
        if (docNum && (!item.發文字號 || !item.發文字號.toLowerCase().includes(docNum.toLowerCase()))) {
            return false;
        }
        // 依據採購法條文篩選
        if (article && (!item.依據採購法條文 || !item.依據採購法條文.toLowerCase().includes(article.toLowerCase()))) {
            return false;
        }
        // 發文日期篩選 (可比對民國年或完整年月日)
        if (date && (!item.發文日期 || !item.發文日期.startsWith(date))) {
            return false;
        }
        // 主題篩選
        if (title && (!item.主題 || !item.主題.toLowerCase().includes(title.toLowerCase()))) {
            return false;
        }
        // 內容全文篩選
        if (content && (!item.內容 || !item.內容.toLowerCase().includes(content.toLowerCase()))) {
            return false;
        }
        return true;
    });
}

// === 渲染搜尋結果 ===
function renderResults(keepPage = false) {
    if (!keepPage) {
        // 若非靜態靜默更新，將捲軸拉回上方
        resultsContainer.scrollTop = 0;
    }

    // 更新總筆數標記
    const totalCount = filteredData.length;
    resultsCount.textContent = `共 ${totalCount} 筆資料`;

    // 當目前沒有任何資料載入且還在載入中時
    if (allData.length === 0) {
        resultsContainer.innerHTML = `
            <div class="skeleton-loader">
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            </div>
        `;
        paginationContainer.innerHTML = '';
        return;
    }

    // 查無資料的 Empty State
    if (totalCount === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
                <h3>查無符合條件的函釋</h3>
                <p>請嘗試放寬或修改您的搜尋關鍵字，或確認背景資料是否已全部載入完畢。</p>
            </div>
        `;
        paginationContainer.innerHTML = '';
        return;
    }

    // 分頁計算
    const totalPages = Math.ceil(totalCount / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
    
    const pageData = filteredData.slice(startIndex, endIndex);

    // 渲染卡片清單
    resultsContainer.innerHTML = '';
    
    pageData.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = item.項次;

        // 判斷是否廢止/補充
        const isAbolished = item.廢止或補充之備註 && item.廢止或補充之備註.trim().length > 0;
        const statusBadge = isAbolished 
            ? `<span class="meta-item meta-status-abolished">有變更/廢止說明</span>`
            : `<span class="meta-item meta-status-active">有效</span>`;

        // 關鍵字高亮處理
        let displayTitle = escapeHtml(item.主題 || '');
        if (searchCriteria.title) {
            displayTitle = highlightKeyword(displayTitle, searchCriteria.title);
        }

        // 格式化發文日期 (例如: 1150528 -> 民國 115/05/28)
        const rawDate = item.發文日期 || '';
        let displayDate = rawDate;
        if (rawDate.length === 7) {
            displayDate = `民國 ${rawDate.slice(0, 3)}/${rawDate.slice(3, 5)}/${rawDate.slice(5, 7)}`;
        } else if (rawDate.length === 6) {
            displayDate = `民國 ${rawDate.slice(0, 2)}/${rawDate.slice(2, 4)}/${rawDate.slice(4, 6)}`;
        }

        card.innerHTML = `
            <div class="card-header">
                <div class="card-summary-left">
                    <div class="card-meta-row">
                        <span class="meta-item meta-doc-num">${escapeHtml(item.發文字號 || '無發文字號')}</span>
                        <span class="meta-item meta-article">${escapeHtml(item.依據採購法條文 || '政府採購法綜合')}</span>
                        <span class="meta-item meta-date">${displayDate}</span>
                        ${statusBadge}
                    </div>
                    <div class="card-title">${displayTitle}</div>
                </div>
                <div class="card-chevron">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
            </div>
            <div class="card-body">
                <div class="card-body-content">
                    <div class="content-block">
                        <div class="content-block-title">函釋主旨與說明</div>
                        <div class="content-text">${formatAndHighlightContent(item.內容, searchCriteria.content)}</div>
                    </div>
                    ${isAbolished ? `
                    <div class="content-block">
                        <div class="content-block-title" style="border-left-color: var(--accent-danger);">廢止或補充之備註</div>
                        <div class="content-text" style="color: var(--accent-warning);">${escapeHtml(item.廢止或補充之備註)}</div>
                    </div>
                    ` : ''}
                    <div class="source-link-container">
                        <a href="${item.連結網址}" target="_blank" rel="noopener noreferrer" class="link-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            前往工程會原始連結
                        </a>
                    </div>
                </div>
            </div>
        `;

        // 點擊摺疊卡片展開事件
        card.querySelector('.card-header').addEventListener('click', () => {
            const isExpanded = card.classList.contains('expanded');
            // 先關閉其他展開的卡片以保持版面整潔 (Accordion 效果)
            document.querySelectorAll('.card.expanded').forEach(c => {
                if (c !== card) {
                    c.classList.remove('expanded');
                    c.querySelector('.card-body').style.maxHeight = null;
                }
            });
            
            if (isExpanded) {
                card.classList.remove('expanded');
                card.querySelector('.card-body').style.maxHeight = null;
            } else {
                card.classList.add('expanded');
                const body = card.querySelector('.card-body');
                // 動態設定 max-height 支援 CSS transition
                body.style.maxHeight = body.scrollHeight + 'px';
            }
        });

        resultsContainer.appendChild(card);
    });

    // 渲染分頁按鈕
    renderPagination(totalPages);
}

// === 分頁按鈕渲染器 ===
function renderPagination(totalPages) {
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) return;

    // 上一頁按鈕
    const prevBtn = document.createElement('button');
    prevBtn.className = `pagination-btn ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    if (currentPage > 1) {
        prevBtn.addEventListener('click', () => {
            currentPage--;
            renderResults();
        });
    }
    paginationContainer.appendChild(prevBtn);

    // 智慧頁碼演算法 (限制最多顯示 7 個按鈕，包含首尾與省略號)
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // 第一頁
    if (startPage > 1) {
        addPageBtn(1);
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationContainer.appendChild(ellipsis);
        }
    }

    // 中間頁碼
    for (let p = startPage; p <= endPage; p++) {
        addPageBtn(p);
    }

    // 最後一頁
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationContainer.appendChild(ellipsis);
        }
        addPageBtn(totalPages);
    }

    // 下一頁按鈕
    const nextBtn = document.createElement('button');
    nextBtn.className = `pagination-btn ${currentPage === totalPages ? 'disabled' : ''}`;
    nextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    if (currentPage < totalPages) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            renderResults();
        });
    }
    paginationContainer.appendChild(nextBtn);
}

function addPageBtn(pageNumber) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn ${currentPage === pageNumber ? 'active' : ''}`;
    btn.textContent = pageNumber;
    btn.addEventListener('click', () => {
        currentPage = pageNumber;
        renderResults();
    });
    paginationContainer.appendChild(btn);
}

// === 工具與輔助函式 ===

// 防止 HTML 注入，跳脫特殊字元
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 將搜尋關鍵字高亮包覆
function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
}

// 格式化內文並處理高亮
function formatAndHighlightContent(rawContent, keyword) {
    if (!rawContent) return '無內容';
    let formatted = escapeHtml(rawContent);
    
    // 將常見的「說明：一、二、三、」加上換行，讓排版更易讀
    formatted = formatted
        .replace(/(說明：)/g, '\n$1')
        .replace(/(一、|二、|三、|四、|五、|六、|七、|八、|九、|十、)/g, '\n$1');
        
    if (keyword) {
        formatted = highlightKeyword(formatted, keyword);
    }
    return formatted.trim();
}

// === AI 解答博士 核心邏輯 ===

// 1. Tab 切換機制
function switchTab(tabType) {
    if (tabType === 'standard') {
        tabStandard.classList.add('active');
        tabAi.classList.remove('active');
        standardSearchContainer.classList.remove('d-none');
        aiSearchContainer.classList.add('d-none');
    } else {
        tabStandard.classList.remove('active');
        tabAi.classList.add('active');
        standardSearchContainer.classList.add('d-none');
        aiSearchContainer.classList.remove('d-none');
    }
}

// 2. API Key 設定彈窗控制
function openApiModal() {
    apiKeyInput.value = geminiApiKey;
    apiModal.classList.add('open');
}

function closeApiModal() {
    apiModal.classList.remove('open');
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    geminiApiKey = key;
    localStorage.setItem('gemini_api_key', key);
    closeApiModal();
    alert('API 金鑰已儲存！');
}

// 3. 呼叫 Google Gemini API 進行語意分析
async function callGeminiAPI(question) {
    const model = 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

    const prompt = `你是一位專業的台灣政府採購法專家。請分析使用者提出的口語問題，提取出最相關的搜尋條件。
    
請嚴格以下列的 JSON 格式回傳（不要包含任何 Markdown 格式框，僅回傳 JSON 內容）：
{
  "article": "採購法具體條文，例如：第22條、第22條第1項第9款。如無則為空字串",
  "titleKeywords": "核心主題關鍵字（1-2個，以空白分隔），例如：限制性招標。如無則為空字串",
  "contentKeywords": "全文內容關鍵字（1-2個，以空白分隔），例如：公告金額 最有利標。如無則為空字串",
  "summary": "針對此問題的一句話簡短分析導讀與回答，說明應該參考哪些條文或函釋方向（不超過 100 字）"
}

使用者問題：「${question}」
JSON 輸出：`;

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: prompt
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP 錯誤 ${response.status}`);
    }

    const resData = await response.json();
    const resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
        throw new Error('AI 未回傳有效內容');
    }

    const parsed = JSON.parse(resultText.trim());
    parsed.isLocal = false; // Mark as Gemini API mode
    return parsed;
}

// 4. 處理 AI 智慧檢索
async function handleAiSearch() {
    const question = aiQuestionInput.value.trim();
    if (!question) {
        alert('請先輸入您想詢問的採購法問題！');
        aiQuestionInput.focus();
        return;
    }

    // 免金鑰模式：執行本地智慧解析與自動檢索
    if (!geminiApiKey) {
        try {
            const result = localSemanticParse(question);
            applySearchAndRender(question, result);
        } catch (err) {
            console.error('本地智慧分析失敗：', err);
            alert(`本地分析失敗：${err.message}`);
        }
        return;
    }

    // 有金鑰模式：按鈕進入載入中狀態並呼叫 Gemini 雲端 API
    btnAiSubmit.disabled = true;
    const originalText = btnAiSubmit.innerHTML;
    btnAiSubmit.innerHTML = `
        <span class="pulse-indicator" style="background-color: #ffffff; box-shadow: 0 0 0 0 rgba(255,255,255,0.7); animation: pulse-white 1s infinite; margin-right: 0.5rem; vertical-align: middle;"></span>
        AI 博士分析中...
    `;

    // 動態載入白色 pulse 的 style
    if (!document.getElementById('pulse-white-style')) {
        const style = document.createElement('style');
        style.id = 'pulse-white-style';
        style.innerHTML = `
            @keyframes pulse-white {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
            }
        `;
        document.head.appendChild(style);
    }

    try {
        const result = await callGeminiAPI(question);
        applySearchAndRender(question, result);
    } catch (err) {
        console.error('AI 智慧分析失敗：', err);
        const errorMsg = err.message || '';
        if (errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('limit') || errorMsg.includes('429')) {
            alert(`AI 智慧分析失敗：您的 Gemini API 金鑰已達免費額度限制或呼叫頻率過高 (Rate Limit/Quota Exceeded)。\n\n【建議解法】請等待約 30 秒後再次嘗試，或點擊右上角齒輪更換另一組免費 API 金鑰。`);
        } else {
            alert(`AI 智慧分析失敗：${errorMsg}\n請確認金鑰是否正確，或前往右上角設定更換金鑰。`);
        }
    } finally {
        btnAiSubmit.disabled = false;
        btnAiSubmit.innerHTML = originalText;
    }
}

// 5. 填入搜尋條件並觸發檢索渲染
function applySearchAndRender(question, result) {
    // 填入標準精準搜尋表單中
    document.getElementById('search-article').value = result.article || '';
    document.getElementById('search-title').value = result.titleKeywords || '';
    document.getElementById('search-content').value = result.contentKeywords || '';
    
    // 清除發文字號與日期，防止條件過度縮小
    document.getElementById('search-doc-num').value = '';
    document.getElementById('search-date').value = '';

    // 切換回精準檢索頁籤，讓使用者看見自動帶入的條件
    switchTab('standard');

    // 執行檢索
    performSearch();

    // 渲染 AI 博士的重點提示卡片
    renderAiGuideCard(question, result);
}

// 6. 渲染結果區上方的 AI 導讀/重點提示卡片
function renderAiGuideCard(question, result) {
    const tagsHtml = [];
    if (result.article) {
        tagsHtml.push(`<span class="ai-tag ai-tag-article">建議法規：${escapeHtml(result.article)}</span>`);
    }
    if (result.titleKeywords) {
        result.titleKeywords.split(/\s+/).forEach(kw => {
            if (kw) tagsHtml.push(`<span class="ai-tag ai-tag-keyword">主題詞：${escapeHtml(kw)}</span>`);
        });
    }
    if (result.contentKeywords) {
        result.contentKeywords.split(/\s+/).forEach(kw => {
            if (kw) tagsHtml.push(`<span class="ai-tag ai-tag-keyword">全文詞：${escapeHtml(kw)}</span>`);
        });
    }

    const modeBadge = result.isLocal 
        ? `<span class="ai-mode-badge" style="font-size: 0.75rem; background-color: var(--border-color); color: var(--text-secondary); padding: 0.15rem 0.5rem; border-radius: 4px; margin-left: 0.5rem; font-weight: 500; border: 1px solid var(--border-color);">本地解析</span>`
        : `<span class="ai-mode-badge" style="font-size: 0.75rem; background-color: rgba(99, 102, 241, 0.15); color: #818cf8; padding: 0.15rem 0.5rem; border-radius: 4px; margin-left: 0.5rem; font-weight: 500; border: 1px solid rgba(99, 102, 241, 0.3);">Gemini 語意分析</span>`;

    aiGuideContainer.innerHTML = `
        <div class="ai-guide-card">
            <div class="ai-guide-header">
                <div class="ai-guide-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                    AI 博士的重點提示
                    ${modeBadge}
                </div>
                <button class="ai-guide-close" aria-label="關閉" onclick="document.getElementById('ai-guide-container').innerHTML = ''">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.15rem; font-weight: 500;">
                分析問題：${escapeHtml(question)}
            </div>
            <div class="ai-guide-content">
                <strong>分析：</strong>${escapeHtml(result.summary || '已自動為您提取最相關的搜尋條件。')}
            </div>
            ${tagsHtml.length > 0 ? `<div class="ai-guide-tags">${tagsHtml.join('')}</div>` : ''}
        </div>
    `;
}

// === 採購法中文數字與法規格式標準化 ===
function normalizeProcurementArticles(text) {
    if (!text) return '';
    const numMap = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '壹': 1, '貳': 2, '參': 3, '肆': 4, '伍': 5, '陸': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
        '廿': 20, '卅': 30
    };
    
    function parseChineseNum(chs) {
        if (!chs) return 0;
        if (/^\d+$/.test(chs)) return parseInt(chs, 10);
        let total = 0;
        let temp = 0;
        for (let i = 0; i < chs.length; i++) {
            const char = chs[i];
            if (numMap[char] !== undefined) {
                const val = numMap[char];
                if (char === '十' || char === '拾') {
                    if (temp === 0) temp = 1;
                    total += temp * 10;
                    temp = 0;
                } else if (char === '廿') {
                    total += 20;
                    temp = 0;
                } else if (char === '卅') {
                    total += 30;
                    temp = 0;
                } else {
                    temp = val;
                }
            }
        }
        total += temp;
        return total;
    }
    
    // 優先把中文或阿拉伯數字的 "第X條/第X項/第X款" 甚至 "X條/X項/X款" 統整轉為標準 "第X條" / "第X項" / "第X款"
    return text.replace(/(第)?\s*([零一二三四五六七八九十廿卅\d]+)\s*([條項款])/g, (match, prefix, numStr, unit) => {
        const arabic = parseChineseNum(numStr);
        return `第${arabic}${unit}`;
    });
}

// 7. 本地智慧關鍵字與法規解析器 (免 API Key 模式)
function localSemanticParse(question) {
    const result = {
        article: '',
        titleKeywords: '',
        contentKeywords: '',
        summary: '',
        isLocal: true // Mark as local mode
    };

    // 1. 標準化中文數字與條文格式
    const normalizedQuestion = normalizeProcurementArticles(question);

    // 2. 提取法規條文 (正則匹配 "第XX條第X項第X款" 或 "第XX條第X款" 或 "第XX條")
    const articleRegex = /(第\d+條(?:第\d+項)?(?:第\d+款)?|第\d+條第\d+款)/g;
    const matchedArticles = normalizedQuestion.match(articleRegex);
    if (matchedArticles && matchedArticles.length > 0) {
        result.article = matchedArticles[0].replace(/\s+/g, '');
    }

    // 3. 基於採購法常用詞庫對照表提取關鍵字
    const keywordsDict = {
        // 主題關鍵字 (對位至「主題關鍵字」欄位)
        '限制性招標': ['限制性招標', '限制性', '協商改採限制性招標', '招標方式變更'],
        '公開招標': ['公開招標', '公開'],
        '選擇性招標': ['選擇性招標', '選擇性'],
        '公開取得': ['公開取得', '公開取得企劃書', '公開取得報價單'],
        '最有利標': ['最有利標', '最有利', '準用最有利標', '適用最有利標'],
        '最低標': ['最低標', '最低'],
        '共同供應契約': ['共同供應契約', '共同供應', '共約'],
        '停權': ['停權', '不良廠商', '第101條停權', '刊登公報', '政府採購公報'],
        '申訴': ['申訴', '採購申訴', '異議', '爭議處理', '調解', '爭議調解'],
        
        // 全文關鍵字 (對位至「全文關鍵字」欄位)
        '評選': ['評選', '評估項目', '評審', '評選委員會', '評分', '評審小組', '評分表', '評審委員', '評估指標'],
        '企劃書': ['企劃書', '徵求企劃書', '企劃案', '服務建議書', '建議書'],
        '公告金額': ['公告金額', '公告金額以上'],
        '未達公告金額': ['未達公告金額', '未達公告'],
        '小額採購': ['小額採購', '小額', '十萬元以下', '10萬元以下'],
        '巨額': ['巨額採購', '巨額', '巨額金額'],
        '查核金額': ['查核金額'],
        '契約變更': ['契約變更', '變更契約', '變更設計', '契約修改', '追加預算', '減價收受'],
        '驗收': ['驗收', '部分驗收', '驗收不符', '驗收程序', '主驗人', '會驗人'],
        '逾期違約金': ['逾期違約金', '逾期', '違約金', '罰款', '扣款', '遲延履約'],
        '保固': ['保固', '保固金', '保固期', '保固責任']
    };

    const matchedKws = [];

    // 逐一匹配詞庫
    for (const [key, aliases] of Object.entries(keywordsDict)) {
        for (const alias of aliases) {
            if (normalizedQuestion.includes(alias)) {
                if (!matchedKws.includes(key)) {
                    matchedKws.push(key);
                }
                break;
            }
        }
    }

    // 詞彙欄位歸類同時在「主題關鍵字」及「全文內文關鍵字」
    result.titleKeywords = matchedKws.join(' ');
    result.contentKeywords = matchedKws.join(' ');

    // 4. 口語贅詞過濾，無匹配關鍵字時的兜底邏輯
    const stopWords = ['請問', '我想', 'know', '知道', '關於', '如何', '什麼', '規定', '需要', '怎麼', '辦理', '適用', '情形', '問題', '有沒有', '法規', '是否', '合適', '合理', '可以', '不可', '不得', '怎麼做', '程序', '方式', '什麼是', '為何', '分析', '解答'];
    
    // 如果字典完全沒有匹配到，就用斷詞提詞作為兜底
    if (!result.titleKeywords && !result.contentKeywords) {
        // 移除條文關鍵字，避免將條文重複做為全文關鍵字
        let cleanedQ = normalizedQuestion;
        if (result.article) {
            cleanedQ = cleanedQ.replace(result.article, '');
        }
        
        const words = cleanedQ.split(/[\s，。？、！\?]+/).filter(w => {
            return w.length >= 2 && !stopWords.includes(w) && !/第\d+[條項款]/.test(w);
        });
        
        if (words.length > 0) {
            const fallbackKeywords = words.slice(0, 2).join(' ');
            result.titleKeywords = fallbackKeywords;
            result.contentKeywords = fallbackKeywords;
        }
    }

    // 5. 根據提取到的法規條文或關鍵字，渲染重點提示文字
    let summaryText = '已透過本地智慧分析提取出最相關的搜尋條件。';
    if (result.article) {
        summaryText += ` 針對「${result.article}」，系統已自動為您定位。`;
        const artNum = result.article.match(/\d+/);
        if (artNum) {
            const num = parseInt(artNum[0], 10);
            if (num === 22) {
                summaryText += ' 政府採購法第 22 條為限制性招標的適用情形（共計 16 款），最常搭配最有利標或評選辦理。';
            } else if (num === 101) {
                summaryText += ' 政府採購法第 101 條為關於將不良廠商停權之刊登公報處分，常伴隨異議申訴救濟程序。';
            } else if (num === 63) {
                summaryText += ' 政府採購法第 63 條主要為採購契約要項及範本規範之法規依據。';
            } else if (num === 19) {
                summaryText += ' 政府採購法第 19 條規定公告金額以上之採購，除另有規定外應公開招標辦理。';
            } else if (num === 48) {
                summaryText += ' 政府採購法第 48 條為招標開標投標廠商家數不足或流標之處理規定。';
            } else if (num === 94) {
                summaryText += ' 政府採購法第 94 條為評選委員會組成與遴選辦法之法源基礎。';
            } else if (num === 102) {
                summaryText += ' 政府採購法第 102 條為廠商對停權通知異議與申訴之期限與程序規定。';
            }
        }
    } else if (result.titleKeywords || result.contentKeywords) {
        summaryText += ` 已為您自動匹配核心關鍵字：${[result.titleKeywords, result.contentKeywords].filter(Boolean).join('、')}。`;
    } else {
        summaryText += ' 未匹配到特定條文或核心關鍵字。請嘗試輸入更具體的採購問題。';
    }

    result.summary = summaryText + '（提示：您可點擊右上角齒輪設定 Gemini API 金鑰以解鎖更強大的大模型語意分析功能）';
    return result;
}
