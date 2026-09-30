"""Build the portable Skill ZIP and execute the extracted bundle with no network."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
NAME = 'official-docx-formatter'
SOURCE = ROOT / 'skill' / NAME
SUB = ROOT / 'submission'
ARCHIVE = SUB / (NAME + '-skill.zip')
FILES = [
    'SKILL.md',
    'references/official-document-standard.md',
    'references/document-ast-schema.json',
    'references/formatting-rules.json',
    'assets/result-summary-template.md',
    'scripts/common.py', 'scripts/ooxml.py',
    'scripts/inspect_docx.py', 'scripts/format_docx.py', 'scripts/validate_docx.py',
]
GUARD = "import socket,sys,runpy; from pathlib import Path; socket.socket=lambda *a,**k: (_ for _ in ()).throw(RuntimeError('Network forbidden')); socket.create_connection=socket.socket; sys.argv=sys.argv[1:]; sys.path.insert(0,str(Path(sys.argv[0]).parent)); runpy.run_path(sys.argv[0],run_name='__main__')"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def execute(scripts, name, *args):
    process = subprocess.run(
        [sys.executable, '-S', '-B', '-c', GUARD, str(scripts / name), *map(str, args)],
        cwd=scripts.parent, capture_output=True, text=True, encoding='utf-8', timeout=30,
    )
    assert process.returncode == 0, process.stderr
    return json.loads(process.stdout)


def main():
    # Release-time YAML validation only; the installed Skill needs no YAML library.
    import yaml
    skill = (SOURCE / 'SKILL.md').read_text(encoding='utf-8')
    match = re.match(r'\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)', skill, re.S)
    assert match, 'Missing YAML frontmatter'
    metadata = yaml.safe_load(match.group(1))
    assert metadata['name'] == NAME and isinstance(metadata['description'], str)
    assert metadata['description'].strip() and len(metadata['description']) <= 1024
    execution = json.loads((ROOT / 'output/skill/execution-tests.json').read_text())
    vitest = json.loads((ROOT / 'output/skill/vitest-results.json').read_text())
    assert execution['pass'] and len(execution['cases']) == 9
    assert vitest['success'] and vitest['numFailedTests'] == 0
    members = []
    SUB.mkdir(exist_ok=True)
    with ZipFile(ARCHIVE, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in sorted(FILES):
            file = SOURCE / relative
            assert file.is_file() and not file.is_symlink()
            data = file.read_bytes()
            assert len(data) < 25 * 1024 * 1024
            text = data.decode('utf-8')
            assert 'DEEPSEEK_API_KEY' not in text
            assert not re.search(r'\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b', text)
            assert not any(x in relative.lower() for x in ['node_modules', '__pycache__', '.pyc', '.env', 'api key'])
            assert file.suffix.lower() in {'.md', '.json', '.py'}
            info = ZipInfo(NAME + '/' + relative, date_time=(2026, 9, 30, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
            members.append({'path': info.filename, 'sizeBytes': len(data), 'sha256': sha(data)})
    assert ARCHIVE.stat().st_size < 50 * 1024 * 1024
    with tempfile.TemporaryDirectory(prefix='extracted-official-skill-') as temp:
        directory = Path(temp)
        with ZipFile(ARCHIVE) as archive:
            assert archive.testzip() is None
            names = archive.namelist()
            assert {n.split('/')[0] for n in names} == {NAME}
            assert sum(Path(n).name.lower() == 'skill.md' for n in names) == 1
            assert len(names) == len(FILES) == 10
            archive.extractall(directory)
        scripts = directory / NAME / 'scripts'
        # Copy public synthetic inputs into the isolated directory. No repo imports.
        source = directory / 'input.docx'
        shutil.copyfile(ROOT / 'demo/乱格式办公通知示例.docx', source)
        ast = directory / 'structure.json'
        shutil.copyfile(ROOT / 'tests/skill-asts/demo.json', ast)
        before = source.read_bytes()
        inspection = execute(scripts, 'inspect_docx.py', source)
        assert inspection['inputSHA256'] == json.loads(ast.read_text())['inputSHA256']
        output = directory / 'formatted.docx'
        execute(scripts, 'format_docx.py', source, '--ast', ast, '--out', output)
        validation = execute(scripts, 'validate_docx.py', source, output)
        reopened = execute(scripts, 'inspect_docx.py', output)
        assert before == source.read_bytes()
        assert inspection['textSHA256'] == reopened['textSHA256']
        example = SUB / 'skill-demo'
        example.mkdir(exist_ok=True)
        shutil.copyfile(output, example / '乱格式办公通知示例_规范版.docx')
        shutil.copyfile(ast, example / 'structure.json')
        write_json(example / 'validation.json', validation)
    report = {
        'skillBundle': 'PASS', 'skillExecution': 'PASS', 'skillDOCXIntegrity': 'PASS',
        'zip': str(ARCHIVE.resolve()),
        'windowsZip': r'D:\Research\office\official-doc-ai\submission\official-docx-formatter-skill.zip',
        'sha256': sha(ARCHIVE.read_bytes()), 'sizeBytes': ARCHIVE.stat().st_size,
        'zipCRC': 'PASS', 'singleTopDirectory': NAME, 'skillMarkdownCount': 1,
        'frontmatter': metadata, 'files': members,
        'forbiddenFiles': 0, 'secretPatternFindings': 0,
        'extractedExecution': {
            'inspect': 'PASS', 'hostAST': 'reviewed full-document host interpretation',
            'format': 'PASS', 'validate': 'PASS', 'reopen': 'PASS',
            'python': sys.version.split()[0], 'sitePackagesDisabled': True,
            'network': 'socket creation denied', 'originalUnchanged': True,
            'validation': validation,
        },
        'executionTests': {'pass': execution['pass'], 'tests': execution['tests'], 'validCases': len(execution['cases'])},
        'vitest': {'pass': vitest['success'], 'passed': vitest['numPassedTests'], 'total': vitest['numTotalTests'], 'skillParityTests': 10},
        'limits': ['Executed extracted bundle locally; no upload to an external Skill library was performed.', 'Font availability and exact pagination require the target office environment.'],
    }
    write_json(SUB / 'evidence/skill-validation.json', report)
    write_json(SUB / 'evidence/skill-execution.json', execution)
    print(json.dumps({k: report[k] for k in ['skillBundle', 'skillExecution', 'skillDOCXIntegrity', 'zip', 'sha256', 'sizeBytes', 'vitest']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
