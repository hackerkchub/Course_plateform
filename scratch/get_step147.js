import fs from 'fs';
import readline from 'readline';

async function extractStep147() {
  const fileStream = fs.createReadStream('C:\\Users\\Kapil Chilhate\\.gemini\\antigravity-ide\\brain\\2c55edcd-27eb-4579-949b-c3d21f187361\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('"step_index":147')) {
      const obj = JSON.parse(line);
      console.log('Step 147 content length:', obj.content.length);
      fs.writeFileSync('D:/Course_plateform/backend/scratch/step_147_prompt.txt', obj.content);
      console.log('Saved step 147 to scratch/step_147_prompt.txt');
      break;
    }
  }
}

extractStep147();
