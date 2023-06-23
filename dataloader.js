async function setFields(items, ids) {
    const itemMap = new Map();
    items.forEach(item => itemMap.set(item.id, item));
    return ids.map(id => itemMap.get(id));
}

async function setArrayFields(items, ids, reference_key) {
    const _item = {};
    items.forEach(item => {
        const item_key = item[reference_key];
        if(!_item[item_key]) {
            _item[item_key] = [];
        }
        _item[item_key].push(item);
    });
    return ids.map(id => _item[id] || []);
}

module.exports={
    setFields,
    setArrayFields
}