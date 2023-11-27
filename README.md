# lol_mw_icon
script to upload lol icons to mw

## build
install dependencies
```
npm install
```
and then build it
```
npm run build
```

## how2use
entry points:
 - ```npm run index-data``` - update indexes
 - ```npm run icon-data``` - check + update icons
*run scripts dirrectly if planning to interrupt it*

## required env
 - `user` - bot login
 - `password` - bot password
 - `realm` - fandom realm

## TODO
 - flag out override on outdate

## whats going on ?
every icon uploaded using schema ```File:Profile-Icons-V1-<id>.<ext>```<br>
every icon have associated data uploaded in ```Module:Profile-Icons/V1/icon/<id>```<br>
alos there are indexes placed in ```Module:Profile-Icons/V1/index``` - for global index<br>
and ```Module:Profile-Icons/V1/index/<name>``` - for any specific index

### content of indexes
global:
```lua
{
    ["<id>"] = id,
    --[[ ... ]]
}
```
specific (name):
```lua
{
    ["<name>"] = {
        id,
        --[[ ... ]]
    },
    --[[ ... ]]
}
```
### how to find icon using this data
#### using id
- validate id (check it in index)
- load icon data
```lua
local data = require("Module:Profile-Icons/V1/icon/" .. id)
```
- get icon mime type *icon data always contain fields image -> mime*
```lua
local mime = data["image"]["mime"]
```
- convert mime to file extention
- using this info compute image name
```lua
local imagePath = "File:Profile-Icons-V1-" .. id .. "." .. ext
```

#### using name
 - validate name (check it in index)
 - get file id
```lua
local id = index[<name>][<offset>]
```
*offset in most cases 1, but icons have name collisions, so single name can be resolved into multiple id's*
 - goto 2 step of "using id"
