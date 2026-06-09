const fs = require('fs');
const path = require('path');

function main() {
    const outputDir = 'data';
    const numChunks = 20;

    // --- Part 1: Handle gplAll (Procurement rulings database) ---
    const files = fs.readdirSync(__dirname);
    const dbFiles = files.filter(f => f.startsWith('gplAll_') && f.endsWith('.json'));

    if (dbFiles.length === 0) {
        console.error('錯誤：找不到任何 gplAll_*.json 原始資料庫檔案！');
        console.log('請下載最新的資料庫 JSON 檔並放入此專案目錄下。');
        process.exit(1);
    }

    // 排序以取得最新的檔案 (例如 1150609 比 1150603 新)
    dbFiles.sort((a, b) => b.localeCompare(a));
    const sourceFile = dbFiles[0];

    console.log(`讀取原始資料庫：${sourceFile}...`);
    const rawData = fs.readFileSync(path.join(__dirname, sourceFile), 'utf8');
    const data = JSON.parse(rawData);

    const totalRecords = data.length;
    console.log(`讀取到總筆數：${totalRecords}`);

    const outputDirPath = path.join(__dirname, outputDir);
    if (!fs.existsSync(outputDirPath)) {
        fs.mkdirSync(outputDirPath);
        console.log(`建立輸出目錄：${outputDir}`);
    }

    const chunkSize = Math.ceil(totalRecords / numChunks);
    console.log(`目標分塊大小：每塊 ${chunkSize} 筆資料`);

    const chunksInfo = [];

    for (let i = 0; i < numChunks; i++) {
        const startIdx = i * chunkSize;
        const endIdx = Math.min(startIdx + chunkSize, totalRecords);

        if (startIdx >= totalRecords) {
            break;
        }

        const chunkData = data.slice(startIdx, endIdx);
        const chunkFilename = `chunk_${i + 1}.json`;
        const chunkPath = path.join(outputDirPath, chunkFilename);

        fs.writeFileSync(chunkPath, JSON.stringify(chunkData, null, 2), 'utf8');

        chunksInfo.push({
            id: i + 1,
            filename: `data/${chunkFilename}`,
            records_count: chunkData.length
        });
        console.log(`儲存分塊 ${i + 1} (${chunkData.length} 筆) 至 ${chunkPath}`);
    }

    // 產生 manifest.json
    const manifest = {
        total_records: totalRecords,
        total_chunks: chunksInfo.length,
        chunks: chunksInfo
    };

    const manifestPath = path.join(outputDirPath, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`儲存索引清單至 ${manifestPath}`);

    // --- Part 2: Handle *Error_*.json (Error Types database) ---
    console.log('\n開始處理錯誤態樣資料庫...');
    const errorFiles = files.filter(f => f.includes('Error_') && f.endsWith('.json'));

    if (errorFiles.length === 0) {
        console.warn('警告：找不到任何 *Error_*.json 原始資料庫檔案！跳過錯誤態樣處理。');
    } else {
        // 依前綴分群 (例如 gplError、sbError)
        const groups = {};
        errorFiles.forEach(f => {
            const parts = f.split('_');
            if (parts.length >= 2) {
                const prefix = parts[0];
                if (!groups[prefix]) {
                    groups[prefix] = [];
                }
                groups[prefix].push(f);
            }
        });

        const latestErrorFiles = [];
        for (const prefix in groups) {
            // 依日期後綴排序取最新版
            groups[prefix].sort((a, b) => b.localeCompare(a));
            latestErrorFiles.push(groups[prefix][0]);
        }

        console.log(`自動偵測並選用以下最新版錯誤態樣檔案：\n${latestErrorFiles.map(f => ` - ${f}`).join('\n')}`);

        let mergedErrors = [];

        latestErrorFiles.forEach(f => {
            const filePath = path.join(__dirname, f);
            const rawErrorData = fs.readFileSync(filePath, 'utf8');
            const errorRecords = JSON.parse(rawErrorData);

            // 決定資料來源標記名稱
            let sourceLabel = '';
            if (f.startsWith('gplError')) {
                sourceLabel = '政府採購錯誤行為態樣';
            } else if (f.startsWith('sbError')) {
                sourceLabel = '選擇性招標錯誤行為態樣';
            } else {
                const prefix = f.split('_')[0];
                sourceLabel = `${prefix}錯誤行為態樣`;
            }

            errorRecords.forEach(record => {
                const newRecord = { ...record };
                newRecord['資料來源'] = sourceLabel;
                mergedErrors.push(newRecord);
            });
        });

        // 將合併後的資料儲存至 error_chunk_1.json
        const errorChunkFilename = 'error_chunk_1.json';
        const errorChunkPath = path.join(outputDirPath, errorChunkFilename);
        fs.writeFileSync(errorChunkPath, JSON.stringify(mergedErrors, null, 2), 'utf8');
        console.log(`儲存合併後錯誤態樣 (${mergedErrors.length} 筆) 至 ${errorChunkPath}`);

        // 產生 error_manifest.json
        const errorManifest = {
            total_records: mergedErrors.length,
            total_chunks: 1,
            chunks: [
                {
                    id: 1,
                    filename: `data/${errorChunkFilename}`,
                    records_count: mergedErrors.length
                }
            ]
        };

        const errorManifestPath = path.join(outputDirPath, 'error_manifest.json');
        fs.writeFileSync(errorManifestPath, JSON.stringify(errorManifest, null, 2), 'utf8');
        console.log(`儲存錯誤態樣索引清單至 ${errorManifestPath}`);
    }

    console.log('\n資料庫分割/切片程序全部完成！');
}

main();
