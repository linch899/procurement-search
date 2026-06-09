const fs = require('fs');
const path = require('path');

function main() {
    const outputDir = 'data';
    const numChunks = 20;

    // 自動尋找目前目錄下符合 gplAll_*.json 的檔案
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
    console.log('資料庫切片完成！');
}

main();
