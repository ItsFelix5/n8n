import { type INodeTypeDescription, isCommunityPackageName } from 'n8n-workflow';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { BUILTIN_NODES_DOCS_URL, NPM_PACKAGE_DOCS_BASE_URL } from '../constants';

export const useNodeDocsUrl = ({
	nodeType: nodeTypeRef,
}: { nodeType: MaybeRefOrGetter<INodeTypeDescription | null | undefined> }) => {
	const packageName = computed(() => toValue(nodeTypeRef)?.name.split('.')[0] ?? '');

	const isCommunityNode = computed(() => {
		const nodeType = toValue(nodeTypeRef);
		if (nodeType) {
			return isCommunityPackageName(nodeType.name);
		}
		return false;
	});

	const docsUrl = computed(() => {
		const nodeType = toValue(nodeTypeRef);
		if (!nodeType) {
			return '';
		}

		if (nodeType.documentationUrl?.startsWith('http')) {
			return nodeType.documentationUrl;
		}

		// Built-in node documentation available via its codex entry
		const primaryDocUrl = nodeType.codex?.resources?.primaryDocumentation?.[0]?.url;
		if (primaryDocUrl) {
			return primaryDocUrl;
		}

		if (isCommunityNode.value) {
			return `${NPM_PACKAGE_DOCS_BASE_URL}${packageName.value}`;
		}

		// Fallback to the root of the node documentation
		return BUILTIN_NODES_DOCS_URL;
	});

	return { docsUrl };
};
