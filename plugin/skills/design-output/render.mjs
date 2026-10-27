// .pptx·.docx 를 같은 폴더의 PDF 로 바꾼다. 디자이너봇은 그 PDF 를 Read 로 열어 쪽마다 그림으로 본다.
// 사용: node render.mjs <파일> (LibreOffice 경로가 다르면 SOFFICE 환경 변수)
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const file = resolve(process.argv[2] ?? "");
const soffice = process.env.SOFFICE ?? "C:/Program Files/LibreOffice/program/soffice.exe";
execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", dirname(file), file], { stdio: "inherit" });
