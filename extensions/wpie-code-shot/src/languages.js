/**
 * The curated language set. We register only these grammars on highlight.js/core
 * so the bundle stays lean, and expose the list for the picker plus the subset
 * used by auto-detection.
 */
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import ruby from 'highlight.js/lib/languages/ruby';
import csharp from 'highlight.js/lib/languages/csharp';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import dart from 'highlight.js/lib/languages/dart';
import scss from 'highlight.js/lib/languages/scss';
import less from 'highlight.js/lib/languages/less';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import ini from 'highlight.js/lib/languages/ini';
import graphql from 'highlight.js/lib/languages/graphql';
import lua from 'highlight.js/lib/languages/lua';
import plaintext from 'highlight.js/lib/languages/plaintext';

const GRAMMARS = {
	javascript,
	typescript,
	xml,
	css,
	json,
	php,
	python,
	bash,
	shell,
	sql,
	java,
	go,
	rust,
	c,
	cpp,
	yaml,
	markdown,
	ruby,
	csharp,
	kotlin,
	swift,
	dart,
	scss,
	less,
	dockerfile,
	ini,
	graphql,
	lua,
	plaintext,
};

// Shown in the picker. `id` is the highlight.js language name.
export const LANGUAGES = [
	{ id: 'auto', label: 'Auto-detect' },
	{ id: 'javascript', label: 'JavaScript' },
	{ id: 'typescript', label: 'TypeScript' },
	{ id: 'xml', label: 'HTML / XML' },
	{ id: 'css', label: 'CSS' },
	{ id: 'php', label: 'PHP' },
	{ id: 'python', label: 'Python' },
	{ id: 'json', label: 'JSON' },
	{ id: 'bash', label: 'Bash / Shell' },
	{ id: 'sql', label: 'SQL' },
	{ id: 'java', label: 'Java' },
	{ id: 'go', label: 'Go' },
	{ id: 'rust', label: 'Rust' },
	{ id: 'c', label: 'C' },
	{ id: 'cpp', label: 'C++' },
	{ id: 'yaml', label: 'YAML' },
	{ id: 'markdown', label: 'Markdown' },
	{ id: 'ruby', label: 'Ruby' },
	{ id: 'csharp', label: 'C#' },
	{ id: 'kotlin', label: 'Kotlin' },
	{ id: 'swift', label: 'Swift' },
	{ id: 'dart', label: 'Dart' },
	{ id: 'scss', label: 'SCSS' },
	{ id: 'less', label: 'LESS' },
	{ id: 'dockerfile', label: 'Dockerfile' },
	{ id: 'ini', label: 'INI / TOML' },
	{ id: 'graphql', label: 'GraphQL' },
	{ id: 'lua', label: 'Lua' },
	{ id: 'plaintext', label: 'Plain text' },
];

// Languages auto-detection is allowed to consider (keeps guesses sane).
export const AUTO_SUBSET = [
	'javascript',
	'typescript',
	'xml',
	'css',
	'php',
	'python',
	'json',
	'bash',
	'sql',
	'java',
	'go',
	'rust',
	'c',
	'cpp',
	'yaml',
	'markdown',
	'ruby',
	'csharp',
	'kotlin',
	'swift',
	'dart',
	'scss',
	'dockerfile',
	'graphql',
	'lua',
];

export function registerLanguages( hljs ) {
	for ( const name in GRAMMARS ) {
		try {
			hljs.registerLanguage( name, GRAMMARS[ name ] );
		} catch ( e ) {
			/* ignore dup */
		}
	}
}
