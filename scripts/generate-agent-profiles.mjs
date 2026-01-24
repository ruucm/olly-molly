#!/usr/bin/env node

/**
 * Generate profile images for all agents using ComfyUI
 * Usage: node scripts/generate-agent-profiles.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMFY_URL = process.env.COMFY_URL || 'http://localhost:8188';
const OUTPUT_DIR = path.join(__dirname, '../public/profiles');

// Agent profile prompts - professional portrait style
const AGENT_PROMPTS = [
  {
    id: 'researcher-001',
    filename: 'researcher.png',
    prompt: 'Professional Asian female researcher in her 30s, wearing glasses and a lab coat, holding a tablet, modern office with books and screens in background. Clean lighting, corporate portrait style, high detail.'
  },
  {
    id: 'content-writer-001',
    filename: 'content-writer.png',
    prompt: 'Creative Caucasian male writer in his late 20s, casual smart attire with rolled sleeves, sitting at a desk with laptop and coffee, warm natural lighting from window. Editorial portrait style.'
  },
  {
    id: 'data-analyst-001',
    filename: 'data-analyst.png',
    prompt: 'Professional Indian male data analyst in his 30s, wearing smart casual clothes, multiple monitors showing charts and graphs behind him. Modern tech office, blue accent lighting, corporate portrait.'
  },
  {
    id: 'security-001',
    filename: 'security-expert.png',
    prompt: 'Serious African American female cybersecurity expert in her 30s, dark hoodie, multiple screens with code in background, dramatic lighting. Cinematic tech noir portrait style.'
  },
  {
    id: 'ux-designer-001',
    filename: 'ux-designer.png',
    prompt: 'Creative Hispanic female UX designer in her late 20s, colorful casual attire, design studio with wireframes and sticky notes on wall, bright natural lighting. Artistic portrait style.'
  },
  {
    id: 'marketing-001',
    filename: 'marketing-specialist.png',
    prompt: 'Energetic Caucasian female marketing specialist in her early 30s, professional blazer, modern open office with brand boards behind her. Vibrant corporate portrait, warm lighting.'
  },
  {
    id: 'tech-writer-001',
    filename: 'tech-writer.png',
    prompt: 'Thoughtful Asian male technical writer in his 40s, wearing glasses and cardigan, surrounded by documentation and dual monitors. Calm office environment, soft professional lighting.'
  },
  {
    id: 'mobile-dev-001',
    filename: 'mobile-dev.png',
    prompt: 'Young Middle Eastern male mobile developer in his mid 20s, casual tech startup attire, holding smartphone with various mobile devices on desk. Modern coworking space, natural lighting.'
  },
  {
    id: 'ml-engineer-001',
    filename: 'ml-engineer.png',
    prompt: 'Focused South Asian female ML engineer in her early 30s, wearing tech company hoodie, GPU server racks visible behind, code on screens. Tech lab environment, cool blue lighting.'
  },
  {
    id: 'fullstack-001',
    filename: 'fullstack-dev.png',
    prompt: 'Confident Brazilian male fullstack developer in his late 20s, casual t-shirt with mechanical keyboard, dual monitor setup showing code. Modern home office, warm ambient lighting.'
  },
  {
    id: 'code-reviewer-001',
    filename: 'code-reviewer.png',
    prompt: 'Experienced Japanese male code reviewer in his late 40s, smart casual with reading glasses, thoughtful expression, clean minimalist office. Professional portrait, soft natural lighting.'
  },
  {
    id: 'dba-001',
    filename: 'dba.png',
    prompt: 'Professional Eastern European female database administrator in her mid 30s, wearing business casual, server room with blinking lights behind. Corporate tech portrait, blue ambient lighting.'
  },
  {
    id: 'product-manager-001',
    filename: 'product-manager.png',
    prompt: 'Dynamic Korean female product manager in her early 30s, professional attire, standing in front of product roadmap whiteboard. Modern startup office, bright collaborative space lighting.'
  },
  {
    id: 'automation-001',
    filename: 'automation-engineer.png',
    prompt: 'Innovative Scandinavian male automation engineer in his mid 30s, casual tech attire, robotic arm and multiple screens in background. Industrial tech lab, modern lighting.'
  }
];

// Base workflow template
const baseWorkflow = {
  "9": {
    "inputs": {
      "filename_prefix": "z-image",
      "images": ["57:8", 0]
    },
    "class_type": "SaveImage",
    "_meta": { "title": "Save Image" }
  },
  "58": {
    "inputs": { "value": "" },
    "class_type": "PrimitiveStringMultiline",
    "_meta": { "title": "Prompt" }
  },
  "57:30": {
    "inputs": {
      "clip_name": "qwen_3_4b.safetensors",
      "type": "lumina2",
      "device": "default"
    },
    "class_type": "CLIPLoader",
    "_meta": { "title": "Load CLIP" }
  },
  "57:29": {
    "inputs": { "vae_name": "ae.safetensors" },
    "class_type": "VAELoader",
    "_meta": { "title": "Load VAE" }
  },
  "57:33": {
    "inputs": { "conditioning": ["57:27", 0] },
    "class_type": "ConditioningZeroOut",
    "_meta": { "title": "ConditioningZeroOut" }
  },
  "57:8": {
    "inputs": {
      "samples": ["57:3", 0],
      "vae": ["57:29", 0]
    },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "57:28": {
    "inputs": {
      "unet_name": "z_image_turbo_bf16.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader",
    "_meta": { "title": "Load Diffusion Model" }
  },
  "57:27": {
    "inputs": {
      "text": ["58", 0],
      "clip": ["57:30", 0]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Prompt)" }
  },
  "57:13": {
    "inputs": {
      "width": 1024,
      "height": 1024,
      "batch_size": 1
    },
    "class_type": "EmptySD3LatentImage",
    "_meta": { "title": "EmptySD3LatentImage" }
  },
  "57:3": {
    "inputs": {
      "seed": 0,
      "steps": 4,
      "cfg": 1,
      "sampler_name": "res_multistep",
      "scheduler": "simple",
      "denoise": 1,
      "model": ["57:11", 0],
      "positive": ["57:27", 0],
      "negative": ["57:33", 0],
      "latent_image": ["57:13", 0]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "57:11": {
    "inputs": {
      "shift": 3,
      "model": ["57:28", 0]
    },
    "class_type": "ModelSamplingAuraFlow",
    "_meta": { "title": "ModelSamplingAuraFlow" }
  }
};

async function queuePrompt(workflow) {
  const response = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  });

  if (!response.ok) {
    throw new Error(`Failed to queue prompt: ${response.status}`);
  }

  return response.json();
}

async function getHistory(promptId) {
  const response = await fetch(`${COMFY_URL}/history/${promptId}`);
  if (!response.ok) {
    throw new Error(`Failed to get history: ${response.status}`);
  }
  return response.json();
}

async function getImage(filename, subfolder, folderType) {
  const params = new URLSearchParams({ filename, subfolder, type: folderType });
  const response = await fetch(`${COMFY_URL}/view?${params}`);

  if (!response.ok) {
    throw new Error(`Failed to get image: ${response.status}`);
  }

  return response.arrayBuffer();
}

async function waitForCompletion(promptId, maxWait = 120000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const history = await getHistory(promptId);

    if (history[promptId]) {
      const outputs = history[promptId].outputs;
      if (outputs && outputs['9'] && outputs['9'].images) {
        return outputs['9'].images[0];
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Timeout waiting for image generation');
}

async function generateImage(agentPrompt) {
  console.log(`Generating image for ${agentPrompt.id}...`);

  // Create workflow with custom prompt and random seed
  const workflow = JSON.parse(JSON.stringify(baseWorkflow));
  workflow['58'].inputs.value = agentPrompt.prompt;
  workflow['57:3'].inputs.seed = Math.floor(Math.random() * 1000000000);

  // Queue the prompt
  const { prompt_id } = await queuePrompt(workflow);
  console.log(`  Queued with ID: ${prompt_id}`);

  // Wait for completion
  const imageInfo = await waitForCompletion(prompt_id);
  console.log(`  Generated: ${imageInfo.filename}`);

  // Download the image
  const imageData = await getImage(imageInfo.filename, imageInfo.subfolder || '', imageInfo.type || 'output');

  // Save to profiles directory
  const outputPath = path.join(OUTPUT_DIR, agentPrompt.filename);
  fs.writeFileSync(outputPath, Buffer.from(imageData));
  console.log(`  Saved to: ${outputPath}`);

  return outputPath;
}

async function main() {
  console.log('Starting profile image generation...\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];

  for (const agent of AGENT_PROMPTS) {
    try {
      const outputPath = await generateImage(agent);
      results.push({ id: agent.id, success: true, path: outputPath });
    } catch (error) {
      console.error(`  Error generating ${agent.id}:`, error.message);
      results.push({ id: agent.id, success: false, error: error.message });
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n=== Generation Complete ===');
  console.log(`Success: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);

  if (results.some(r => !r.success)) {
    console.log('\nFailed generations:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.id}: ${r.error}`);
    });
  }
}

main().catch(console.error);
