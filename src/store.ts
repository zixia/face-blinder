import * as util      from 'util'

import { log }        from 'brolog'
import * as rimraf    from 'rimraf'

import * as encoding  from 'encoding-down'
import * as leveldown from 'leveldown'
import * as levelup   from 'levelup'

// https://github.com/Microsoft/TypeScript/issues/14151#issuecomment-280812617
(<any>Symbol).asyncIterator = Symbol.asyncIterator || Symbol.for('Symbol.asyncIterator')

export class Store<K, V> {
  private levelDb: levelup.LevelUp<
    K,
    V,
    leveldown.LevelDownOptions,
    any, any, any, any, any
  >

  constructor(
    public workDir: string
  ) {
    log.verbose('Store', 'constructor()')

    // https://twitter.com/juliangruber/status/908688876381892608
    const encoded = encoding(
      leveldown<K, V>(workDir)
    )
    this.levelDb  = levelup(encoded)
  }

  public async put(key: K, value: V): Promise<void> {
    log.verbose('Store', 'put(%s, %s)', key, value)
    return await this.levelDb.put(key, value)
  }

  public async get(key: K): Promise<V | null> {
    log.verbose('Store', 'get(%s)', key)
    try {
      return await this.levelDb.get(key)
    } catch (e) {
      if (/NotFoundError/.test(e)) {
        return null
      }
      throw e
    }
  }

  public del(key: K): Promise<void> {
    log.verbose('Store', 'del(%s)', key)
    return this.levelDb.del(key)
  }

  public async* keys(): AsyncIterableIterator<K> {
    log.verbose('Store', 'keys()')

    const keyStream = this.levelDb.createKeyStream()

    const endPromise = new Promise<false>((resolve, reject) => {
      keyStream
        .once('end',  () => resolve(false))
        .once('error', e => reject(e))
    })

    let key: K | false

    do {
      const keyPromise = new Promise<K>((resolve, reject) => {
        keyStream.once('data', key => resolve(key))
      })

      key = await Promise.race([
        keyPromise,
        endPromise,
      ])

      if (key) {
        yield key
      }

    } while (key)

  }

  public async* values(): AsyncIterableIterator<V> {
    log.verbose('Store', 'values()')

    const valueStream = this.levelDb.createValueStream()

    const endPromise = new Promise<false>((resolve, reject) => {
      valueStream
        .once('end',  () => resolve(false))
        .once('error', e => reject(e))
    })

    let value: V | false

    do {
      const valuePromise = new Promise<V>((resolve, reject) => {
        valueStream.once('data', value => resolve(value))
      })

      value = await Promise.race([
        valuePromise,
        endPromise,
      ])

      if (value) {
        yield value
      }

    } while (value)

  }

  public async count(): Promise<number> {
    log.verbose('Store', 'count()')

    let count = 0
    for await (const _ of this.keys()) {
      count++
    }
    return count
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<[K, V]> {
    log.verbose('Store', '*[Symbol.asyncIterator]()')

    const readStream = this.levelDb.createReadStream()

    const endPromise = new Promise<false>((resolve, reject) => {
      readStream
        .once('end',  () => resolve(false))
        .once('error', e => reject(e))
    })

    let pair: [K, V] | false

    do {
      const dataPromise = new Promise<[K, V]>((resolve, reject) => {
        readStream.once('data', data => resolve([data.key, data.value]))
      })

      pair = await Promise.race([
        dataPromise,
        endPromise,
      ])

      if (pair) {
        yield pair
      }

    } while (pair)

  }

  public async destroy(): Promise<void> {
    log.verbose('Store', 'destroy()')
    await this.levelDb.close()
    await util.promisify(rimraf)(this.workDir)
  }
}

export default Store
