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
        aiQuestionInput.focus();
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
    const model = 'gemini-1.5-flash';
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

    return JSON.parse(resultText.trim());
}

// 4. 處理 AI 智慧檢索
async function handleAiSearch() {
    if (!geminiApiKey) {
        alert('使用 AI 解答博士前，請先點擊右上角齒輪設定您的 Gemini API 金鑰！');
        openApiModal();
        return;
    }

    const question = aiQuestionInput.value.trim();
    if (!question) {
        alert('請先輸入您想詢問的採購法問題！');
        aiQuestionInput.focus();
        return;
    }

    // 按鈕進入載入中狀態
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

        // 1. 填入標準精準搜尋表單中
        document.getElementById('search-article').value = result.article || '';
        document.getElementById('search-title').value = result.titleKeywords || '';
        document.getElementById('search-content').value = result.contentKeywords || '';
        
        // 清除發文字號與日期，防止條件過度縮小
        document.getElementById('search-doc-num').value = '';
        document.getElementById('search-date').value = '';

        // 2. 切換回精準檢索頁籤，讓使用者看見自動帶入的條件
        switchTab('standard');

        // 3. 執行檢索
        performSearch();

        // 4. 渲染 AI 導讀重點提示卡片
        renderAiGuideCard(question, result);
    } catch (err) {
        console.error('AI 智慧分析失敗：', err);
        alert(`AI 智慧分析失敗：${err.message}\n請確認金鑰是否正確，或前往右上角設定更換金鑰。`);
    } finally {
        btnAiSubmit.disabled = false;
        btnAiSubmit.innerHTML = originalText;
    }
}

// 5. 渲染結果區上方的 AI 導讀提示卡片
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

    aiGuideContainer.innerHTML = `
        <div class="ai-guide-card">
            <div class="ai-guide-header">
                <div class="ai-guide-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                    AI 解答博士 重點導讀
                </div>
                <button class="ai-guide-close" aria-label="關閉" onclick="document.getElementById('ai-guide-container').innerHTML = ''">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
