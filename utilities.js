module.exports = {
    removeDuplicates (arr) {
        return arr.filter ((el, pos, a) => (a.indexOf(el) == pos) && el );
    },
    getRegexCaptures (content, regex, callback) {
        let matches, result = [];

        while ((matches = regex.exec(content)) !== null) {
            if (matches.index === regex.lastIndex) regex.lastIndex++; // This is necessary to avoid infinite loops with zero-width matches
            callback (matches.splice(1), result);
        }

        return result;
    },
    prettifyList (input) { // "a, b ,,b   ,,  c,d,d" ==> [a, b, c, d]
        let tags = input
            .split (',')
            .map (s => s.trim())
            .filter (s => s != '');

        return this.removeDuplicates (tags);
    },
    isEqual (str1, str2) {
        return str1.toLowerCase().trim() === str2.toLowerCase().trim();
    },
    clock (start) {
        if ( !start ) return process.hrtime();
        var end = process.hrtime(start);
        return Math.round((end[0]*1000) + (end[1]/1000000));
    },
    swap (arr, a, b) {
        let temp = arr[a];
        arr[a] = arr[b];
        arr[b] = temp;
        return arr;
    },

    //===================================================================================================
    //      THESE FUNCTIONS DEPEND ON A CURRENT NOTEKEEPER REALISATION
    //===================================================================================================
    getUsedTags (base) {
        let tagsArr = base.reduce ((acc, record) => (acc.concat (record.tags)), []);

        return this.removeDuplicates (tagsArr);
    },
    concatUniqText (acc, addition) {
        if (!acc) return addition;
        if (!addition) return acc;

        if (addition.startsWith (acc))
            return addition;

        return acc +'\n\n'+ addition;
    },
    concatUniqTags (tags1, tags2) { // Returns Array !
        if (typeof tags1 == 'string') tags1 = tags1.split(', ');
        if (typeof tags2 == 'string') tags2 = tags2.split(', ');

        if (!tags1.length) return tags2;
        if (!tags2.length) return tags1;

        const res = tags1.concat (tags2);
        return this.removeDuplicates (res);
    },
    searchName (base, name) {
        return name ?
            base.findIndex (record => this.isEqual (record.name, name) ) :
            -1;     // empty name equals to uniq name
    },

    // TREE VIEW
    buildTree (base, rootId) {
        const isEqual = this.isEqual;
        let tree = [];  
        let rootRecord = { _childrenIds: [] };
        let specifiedRoot = rootId===null ? rootRecord : base[rootId];
        let isCircular = false;
        let loop = [];


        base.forEach ((record, i) => { // set IDs, parents and children
            if (!record.text.trim()) return; // jump over empty records
            record._id = i;
            record._parentsIds = getParentsIds (record.tags, base);  // find Ids of all parents (tags)
            setChild (record, base, rootRecord);  // register the record in each parent's record as a child
        });

        setLevels (specifiedRoot, base);
        sortChildren (specifiedRoot, base);
        makeTree (specifiedRoot, base, tree);
        clearBaseIds (base);

        
        return tree;


        function getParentsIds (parents, base) {
            let len = parents.length;
            if (!len || !parents[0]) return ['rootRecord'];

            let parentIds = Array (len);
            for (let i=0; i<len; i++) {
                let tag = parents[i];
                let id = base.findIndex (e => isEqual (e.name, tag));

                if (id !== -1) parentIds[i] = id;
                else parentIds[i] = 'rootRecord'; 
            };
            return parentIds;
        }
        function setChild (record, base, rootRecord) {
            let parents = record._parentsIds;
            for (let i=0; i<parents.length; i++) {
                let parentId = parents[i];
                let parent = parentId === 'rootRecord' ? rootRecord : base[parentId];
                if (!parent._childrenIds) parent._childrenIds = [record._id];
                else parent._childrenIds.push (record._id);
            }
        }
        function setLevels (specifiedRoot, base) {
            if (isCircular) return;

            let level = specifiedRoot.level || 0;
            if (!specifiedRoot.level && specifiedRoot._id >= 0) { // not a global Root. It will be shown.
                level = 1;
            }
            if (!specifiedRoot._childrenIds) return tree; // exit from a recursion


            if (level > 100) { // Catching circular links
                loop.push ({name: specifiedRoot.name, parents: specifiedRoot.tags, id: specifiedRoot._id});
            }
            if (level > 110) {
                if (loop.findIndex (e => e.name === specifiedRoot.name) >= 0) {
                    isCircular = true;
                    console.error ('Circular link is found!');

                    const victim = loop.find (record => { // searching a record with an error
                        return record.parents.find (parent => {
                            const found = loop.find (e => isEqual (e.name, parent))
                            if (!found) return true; 
                        });
                    });
                    const errorTags = victim.parents.filter (parent => { // wrong tag
                        return loop.find (e => isEqual (e.name, parent))
                    });


                    tree = [ base[victim.id] ];
                    tree.error = `CIRCULAR LINK: "${errorTags.join(', ')}"`;
                    return;
                }
            }
            
            specifiedRoot._childrenIds.forEach (childId => { // set children levels
                let child = base[childId];
                child.level = level + 1;

                setLevels (child, base);
            });
        }
        function sortChildren (specifiedRoot, base) {
            if (isCircular) return;

            let children = specifiedRoot._childrenIds;
            if (!children) return;

            children.sort((a,b) => base[a].name > base[b].name ? 1 : -1)

            children.forEach (childId => {                
                sortChildren (base[childId], base);
            });
        }
        function makeTree (specifiedRoot, base, tree) {
            if (isCircular) return;

            let level = 0;
            if (specifiedRoot.level) level = specifiedRoot.level; // recursion level
            else if (specifiedRoot._id) { // this record is not a global Root. It will be shown.
                level = 1;
                tree.push ({
                    name: specifiedRoot.name,
                    text: specifiedRoot.text,
                    modifier: 1,
                });
            }
            
            if (!specifiedRoot._childrenIds) return tree;

            specifiedRoot._childrenIds.forEach (childId => { // getting levels of children
                let child = base[childId];
                child.level = level + 1;

                tree.push ({
                    name: child.name,
                    text: child.text,
                    modifier: child.level,
                });

                makeTree (child, base, tree);
            });
        }
        function clearBaseIds (base) {
            base.forEach (record => {
                record._parentsIds = undefined;
                record._childrenIds = undefined;
            });
        }
    },

    // CONSOLE
    LOG (msg) {
        G.isLogging && console.log ('\x1b[2m%s\x1b[0m', msg);
    },
    ERR (msg) {
        console.log ('\x1b[31m%s\x1b[0m', msg);
    },
}
