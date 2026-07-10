#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function replaceOne(haystack, needle, replacement, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  return haystack.replace(needle, replacement);
}

function patchConfigRs(text) {
  text = replaceOne(
    text,
    "use std::collections::VecDeque;\n",
    "use std::collections::VecDeque;\nuse js_sys::Uint8Array;\n",
    'config.rs import Uint8Array',
  );

  text = replaceOne(
    text,
    "    UploadSaveFile,\n    ConfigureInput { name: String },\n",
    "    UploadSaveFile,\n    OpenRomBytes {\n        rom: Vec<u8>,\n        rom_file_name: String,\n    },\n    ConfigureInput { name: String },\n",
    'config.rs EmulatorCommand::OpenRomBytes',
  );

  text = replaceOne(
    text,
    "    pub fn request_upload_save_file(&self) {\n        self.commands.borrow_mut().push_back(EmulatorCommand::UploadSaveFile);\n    }\n\n    pub fn request_configure_input(&self, name: &str) {\n",
    "    pub fn request_upload_save_file(&self) {\n        self.commands.borrow_mut().push_back(EmulatorCommand::UploadSaveFile);\n    }\n\n    pub fn request_open_rom_bytes(&self, rom: Uint8Array, rom_file_name: &str) {\n        self.commands.borrow_mut().push_back(EmulatorCommand::OpenRomBytes {\n            rom: rom.to_vec(),\n            rom_file_name: rom_file_name.into(),\n        });\n    }\n\n    pub fn request_configure_input(&self, name: &str) {\n",
    'config.rs request_open_rom_bytes',
  );

  return text;
}

function patchLibRs(text) {
  text = replaceOne(
    text,
    "    web_sys::window()\n        .and_then(|window| window.document())\n        .and_then(|document| {\n            let dst = document.get_element_by_id(\"jgenesis-wasm\")?;\n            let canvas = web_sys::Element::from(window.canvas()?);\n            dst.append_child(&canvas).ok()?;\n            Some(())\n        })\n        .expect(\"Unable to append canvas to document\");\n",
    "    let document = web_sys::window()\n        .and_then(|window| window.document())\n        .expect(\"Unable to access document\");\n\n    let dst = document\n        .get_element_by_id(\"jgenesis-wasm\")\n        .or_else(|| document.body().map(web_sys::Element::from))\n        .expect(\"Unable to find DOM mount target\");\n\n    let canvas =\n        web_sys::Element::from(window.canvas().expect(\"Unable to get window canvas\"));\n    dst.append_child(&canvas).expect(\"Unable to append canvas to document\");\n",
    'lib.rs mount target fallback',
  );

  text = replaceOne(
    text,
    "                EmulatorCommand::UploadSaveFile => {\n                    wasm_bindgen_futures::spawn_local(upload_save_file(event_loop_proxy.clone()));\n                }\n                EmulatorCommand::Reset => {\n",
    "                EmulatorCommand::UploadSaveFile => {\n                    wasm_bindgen_futures::spawn_local(upload_save_file(event_loop_proxy.clone()));\n                }\n                EmulatorCommand::OpenRomBytes { rom, rom_file_name } => {\n                    wasm_bindgen_futures::spawn_local(open_rom_bytes(\n                        event_loop_proxy.clone(),\n                        rom,\n                        rom_file_name,\n                    ));\n                }\n                EmulatorCommand::Reset => {\n",
    'lib.rs handle OpenRomBytes command',
  );

  text = replaceOne(
    text,
    "async fn open_bios(key: &str, supported_extensions: &[&str]) {\n",
    "async fn open_rom_bytes(\n    event_loop_proxy: EventLoopProxy<JgenesisUserEvent>,\n    rom: Vec<u8>,\n    rom_file_name: String,\n) {\n    let extension = Path::new(&rom_file_name)\n        .extension()\n        .map(|ext| ext.to_string_lossy().to_ascii_lowercase());\n\n    let bios_rom = match extension.as_deref() {\n        Some(\"chd\") => {\n            let Some(bios_rom) = read_bios_from_idb(SCD_BIOS_KEY).await else {\n                js::alert(\"Sega CD emulation requires a Sega CD BIOS ROM to be configured\");\n                return;\n            };\n            Some(bios_rom)\n        }\n        Some(\"gba\") => {\n            let Some(bios_rom) = read_bios_from_idb(GBA_BIOS_KEY).await else {\n                js::alert(\"GBA emulation requires a GBA BIOS ROM to be configured\");\n                return;\n            };\n            Some(bios_rom)\n        }\n        _ => None,\n    };\n\n    let save_files = save::load_all(&rom_file_name).await;\n\n    event_loop_proxy\n        .send_event(JgenesisUserEvent::FileOpen { rom, bios_rom, rom_file_name, save_files })\n        .expect(\"Unable to send file opened event\");\n}\n\nasync fn open_bios(key: &str, supported_extensions: &[&str]) {\n",
    'lib.rs open_rom_bytes helper',
  );

  return text;
}

function patchFile(filePath, patcher) {
  const before = fs.readFileSync(filePath, 'utf8');
  const after = patcher(before);
  fs.writeFileSync(filePath, after, 'utf8');
}

function main() {
  const repoRoot = process.argv[2];
  if (!repoRoot) {
    throw new Error('Usage: patch-jgenesis-web.mjs <jgenesis-repo-root>');
  }

  const configRs = path.join(repoRoot, 'frontend/jgenesis-web/src/config.rs');
  const libRs = path.join(repoRoot, 'frontend/jgenesis-web/src/lib.rs');

  patchFile(configRs, patchConfigRs);
  patchFile(libRs, patchLibRs);
}

try {
  main();
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}
