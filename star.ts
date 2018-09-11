import * as fs from 'fs'
import YAML from 'yaml'
import { GraphQLSchema } from 'graphql'
import { createRemoteSchema } from './createRemoteSchema'
import { mergeSchemas } from 'graphql-tools'

interface StarSchemaMetadata {
    root: boolean
}

interface StarSchemaDefinition {
    type: string
    url: string
    query: string
}

export interface StarSchemaTable {
    name: string
    metadata: StarSchemaMetadata
    definition: StarSchemaDefinition
    links: any[]
    GraphQLSchema: GraphQLSchema
    createLinkSchema(): string
    createResolvers(any): any
}

export interface StarSchemaMap {
    tables: StarSchemaTable[]
    getAllSchema(): void
    getRootTable(): StarSchemaTable | undefined
    find(targetName: string): StarSchemaTable | undefined
    schemas(): (GraphQLSchema | string)[]
    createTotalExecutableSchema(any): any
}

class StarSchemaTableImpl implements StarSchemaTable {
    name: string
    metadata: StarSchemaMetadata
    definition: StarSchemaDefinition
    links: any[]
    GraphQLSchema: GraphQLSchema
    constructor(table: StarSchemaTable) {
        Object.assign(this, table)
    }
    createLinkSchema() {
        return `
        extend type ${this.name} {
            ${createLinks(this)}
        }
    `
    }
    createResolvers(mergeResolvers: any) {
        var rtn = {}
        var name = this.name
        for(var jo of this.links) {
            var fragment = `fragment ${name}Fragment on ${name} {${Object.keys(jo.sameAt).join(',')}}`
            var resolversOfJoin = mergeResolvers[jo.as]
            var resolve = async (parent: any, args: any, context: any, info: any) => {
                return await (resolversOfJoin(jo.sameAt)(parent, args, context, info))
                
            }
            var resolver = {
                fragment,
                resolve
            }
            rtn[jo.as] = resolver
        }
        return { [this.name]: rtn }
    }
}

class StarSchemaMapImpl implements StarSchemaMap {
    tables: StarSchemaTable[]
    root: StarSchemaTable
    constructor(tables: StarSchemaTable[]) {
        this.tables = tables.map(table => new StarSchemaTableImpl(table))
        var root = this.getRootTable()
        if(root == null) {
            throw new Error("no input")
        }
        this.root = root
    }
    async getAllSchema() {
        await getAllSchemaPrivate(this.tables)
    }
    getRootTable() {
        return this.tables.find(schema => { return schema.metadata.root })
    }
    find(targetName: string) {
        return this.tables.find(schema => { return schema.name == targetName })
    }
    schemas() {
        var rtn: (GraphQLSchema | string)[] = this.tables.map(schema => schema.GraphQLSchema)
        // todo: not only root 
        rtn.push(this.root.createLinkSchema())
        return rtn
    }
    createMergeArgs(mergeResolvers) {
        var resolvers = this.root.createResolvers(mergeResolvers)
        var schemas = this.schemas()
        var mergeSchemaArg = {
            schemas,
            resolvers
        }
        return mergeSchemaArg
    }
    createTotalExecutableSchema(mergeResolvers) {
        var mergeSchemaArg = this.createMergeArgs(mergeResolvers)
        return mergeSchemas(mergeSchemaArg)
    }
}

export const loadConfig = (filename: string) => {
    var yamlData = fs.readFileSync(filename,'utf8');
    var obj = YAML.parse(yamlData);
    var starSchema: StarSchemaMap = new StarSchemaMapImpl(<StarSchemaTable[]> obj.tables)
    return starSchema
}

const createSchema = async (schema: StarSchemaTable) => {
    return await createRemoteSchema(schema.definition.url) 
}

const getAllSchemaPrivate = async (starSchemas: StarSchemaTable[]) => {
    await Promise.all(
        starSchemas.map(async schema => { schema.GraphQLSchema = await createSchema(schema) })
    )
}

const toType = (type: string, onlyOne: string | boolean) => {
    if(onlyOne == 'true' || onlyOne == true) {
        return type
    }
    return `[${type}]`
}

export const createLinks = (starSchema: StarSchemaTable ) => {
    // todo: use schema
    var rtn = starSchema.links.map(jo => { return `${jo.as}: ${toType(jo.to, jo.onlyOne)}` }).join('\n')
    console.log(rtn)
    return rtn
}



