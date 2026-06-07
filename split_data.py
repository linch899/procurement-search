import os
import json
import math

def main():
    source_file = "gplAll_1150603.json"
    output_dir = "data"
    num_chunks = 20

    print(f"Reading {source_file}...")
    if not os.path.exists(source_file):
        print(f"Error: {source_file} not found.")
        return

    with open(source_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    total_records = len(data)
    print(f"Total records read: {total_records}")

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created directory: {output_dir}")

    chunk_size = math.ceil(total_records / num_chunks)
    print(f"Target chunk size: {chunk_size} records per chunk")

    chunks_info = []

    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min(start_idx + chunk_size, total_records)
        
        # Stop if start index is beyond total records
        if start_idx >= total_records:
            break
            
        chunk_data = data[start_idx:end_idx]
        chunk_filename = f"chunk_{i + 1}.json"
        chunk_path = os.path.join(output_dir, chunk_filename)

        with open(chunk_path, "w", encoding="utf-8") as out_f:
            json.dump(chunk_data, out_f, ensure_ascii=False, indent=2)

        # Record info for manifest using relative URL path
        chunks_info.append({
            "id": i + 1,
            "filename": f"data/{chunk_filename}",
            "records_count": len(chunk_data)
        })
        print(f"Saved chunk {i + 1} ({len(chunk_data)} records) to {chunk_path}")

    # Generate manifest
    manifest = {
        "total_records": total_records,
        "total_chunks": len(chunks_info),
        "chunks": chunks_info
    }
    
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as out_m:
        json.dump(manifest, out_m, ensure_ascii=False, indent=2)

    print(f"Saved manifest to {manifest_path}")
    print("Data splitting complete!")

if __name__ == "__main__":
    main()
