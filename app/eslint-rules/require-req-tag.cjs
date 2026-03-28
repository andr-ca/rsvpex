// app/eslint-rules/require-req-tag.js

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require @req JSDoc tag on exported functions in domain/, routes/, handlers/, middleware/',
      category: 'Documentation',
    },
    messages: {
      missingReqTag:
        'Exported function "{{name}}" is missing a @req JSDoc tag referencing a requirement ID (e.g. @req CAP-01).',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename()

    // Only enforce in target directories
    const targetDirs = /src\/(domain|routes|handlers|middleware)\//
    if (!targetDirs.test(filename)) {
      return {}
    }

    function hasReqTag(node) {
      const sourceCode = context.sourceCode || context.getSourceCode()
      const comments = sourceCode.getCommentsBefore(node)
      for (const comment of comments) {
        if (comment.type === 'Block' && /@req\s+\S/.test(comment.value)) {
          return true
        }
      }
      return false
    }

    function hasFileLevelReqTag() {
      const sourceCode = context.sourceCode || context.getSourceCode()
      const program = sourceCode.ast
      if (program.body.length === 0) return false
      const firstNode = program.body[0]
      const comments = sourceCode.getCommentsBefore(firstNode)
      for (const comment of comments) {
        if (comment.type === 'Block' && /@req\s+\S/.test(comment.value)) {
          return true
        }
      }
      return false
    }

    function isFunctionLikeExport(node) {
      if (!node) return false
      if (node.type === 'FunctionDeclaration') return true
      if (node.type === 'VariableDeclaration') {
        return node.declarations.some(
          (d) =>
            d.init &&
            (d.init.type === 'ArrowFunctionExpression' ||
              d.init.type === 'FunctionExpression'),
        )
      }
      if (
        node.type === 'TSTypeAliasDeclaration' ||
        node.type === 'TSInterfaceDeclaration'
      ) {
        return false
      }
      return false
    }

    function getExportName(node) {
      if (node.declaration) {
        if (node.declaration.id) return node.declaration.id.name
        if (node.declaration.declarations && node.declaration.declarations[0]) {
          return node.declaration.declarations[0].id.name
        }
      }
      return '<anonymous>'
    }

    return {
      ExportNamedDeclaration(node) {
        if (node.exportKind === 'type') return
        if (node.source) return
        if (node.declaration && !isFunctionLikeExport(node.declaration)) return

        if (!hasReqTag(node) && !hasFileLevelReqTag()) {
          context.report({
            node,
            messageId: 'missingReqTag',
            data: { name: getExportName(node) },
          })
        }
      },
      ExportDefaultDeclaration(node) {
        if (!hasReqTag(node) && !hasFileLevelReqTag()) {
          context.report({
            node,
            messageId: 'missingReqTag',
            data: { name: 'default' },
          })
        }
      },
    }
  },
}

module.exports = rule
