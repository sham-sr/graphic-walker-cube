function resolveChart(data) {
    const parsed = JSON.parse(data);
    if (parsed && parsed.encodings) {
        return parsed;
    }
    if (parsed && parsed.base) {
        return {
            visId: parsed.base.visId,
            name: parsed.base.name || 'Chart',
            encodings: parsed.base.encodings || {},
            config: parsed.base.config || {},
            layout: parsed.base.layout || {},
        };
    }
    return parsed;
}

module.exports = { resolveChart };
